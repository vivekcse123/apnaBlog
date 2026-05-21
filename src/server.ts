import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import express, { NextFunction, Request, Response } from 'express';
import { join } from 'node:path';
import { SitemapStream, streamToPromise } from 'sitemap';
import { Readable } from 'node:stream';

const browserDistFolder = join(import.meta.dirname, '../browser');

const app = express();
const angularApp = new AngularNodeAppEngine({
  allowedHosts: [
    'apnainsights.com',
    'www.apnainsights.com',
  ],
});

// Angular SSR's SSRF guard blocks any request whose Host is "localhost" or a
// private IP.  In production Render forwards the real domain name, so no
// rewrite is needed there.  For local dev (and as a safety net) we override
// the Host header to the public origin whenever the incoming host looks like
// a loopback address.
const PUBLIC_HOST = (() => {
  const origin = process.env['APP_ORIGIN'] ?? 'https://apnainsights.com';
  try { return new URL(origin).host; } catch { return 'apnainsights.com'; }
})();

const isLoopback = (host: string) =>
  host === 'localhost' ||
  host.startsWith('localhost:') ||
  host === '127.0.0.1' ||
  host.startsWith('127.0.0.1:') ||
  host === '::1';

// Dynamic sitemap — fetches all published posts and emits sitemap.xml.
// Cached for 1 hour so the API isn't hit on every Googlebot request.
const SITE_ORIGIN = 'https://apnainsights.com';
let sitemapCache: Buffer | null = null;
let sitemapCachedAt = 0;
const SITEMAP_TTL = 60 * 60 * 1000; // 1 hour

const ALL_CATEGORIES = [
  'News', 'Technology', 'Health', 'Sports', 'Village', 'Business',
  'Entertainment', 'Education', 'Lifestyle', 'Cooking', 'Exercise',
  'Social', 'Quotes', 'Update',
];

const STATIC_PAGES = [
  { url: '/',               changefreq: 'daily',   priority: 1.0 },
  { url: '/shorts',         changefreq: 'hourly',  priority: 0.9 },
  { url: '/about',          changefreq: 'monthly',  priority: 0.7 },
  { url: '/privacy-policy', changefreq: 'yearly',   priority: 0.3 },
  { url: '/terms',          changefreq: 'yearly',   priority: 0.3 },
  { url: '/disclaimer',     changefreq: 'yearly',   priority: 0.3 },
  // Category landing pages — one per topic
  ...ALL_CATEGORIES.map(cat => ({
    url:        `/category/${cat.toLowerCase()}`,
    changefreq: 'daily' as const,
    priority:   0.8,
  })),
];

app.get('/sitemap.xml', async (_req: Request, res: Response) => {
  try {
    if (sitemapCache && Date.now() - sitemapCachedAt < SITEMAP_TTL) {
      res.setHeader('Content-Type', 'application/xml');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      return res.send(sitemapCache);
    }

    // Fetch all posts and shorts in parallel — paginate until exhausted
    const fetchAll = async <T>(baseUrl: string): Promise<T[]> => {
      const items: T[] = [];
      let pg = 1;
      while (true) {
        const r = await fetch(`${baseUrl}&page=${pg}&limit=100`, {
          headers: { Accept: 'application/json' },
          signal: AbortSignal.timeout(8000),
        });
        if (!r.ok) break;
        const body = await r.json() as { data?: T[]; totalPages?: number };
        const batch = body?.data ?? [];
        items.push(...batch);
        if (pg >= (body?.totalPages ?? 1) || batch.length === 0) break;
        pg++;
      }
      return items;
    };

    type PostEntry  = { slug?: string; _id?: string; updatedAt?: string; tags?: string[]; user?: { name?: string; _id?: string } };
    type ShortEntry = { _id?: string; updatedAt?: string; createdAt?: string; isSponsored?: boolean };

    const [posts, shorts] = await Promise.all([
      fetchAll<PostEntry>(`${API_BASE}/post?status=published`),
      fetchAll<ShortEntry>(`${API_BASE}/shorts?status=published`),
    ]);

    // Collect unique tags and author slugs from posts
    const tagCounts = new Map<string, number>();
    const authorSlugs = new Map<string, string>(); // _id → name slug
    for (const p of posts) {
      for (const tag of (p.tags ?? [])) {
        tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
      }
      if (p.user?._id && p.user?.name) {
        const slug = encodeURIComponent(p.user.name.toLowerCase().replace(/\s+/g, '-'));
        authorSlugs.set(p.user._id, slug);
      }
    }

    // Include tags that appear on 2+ posts to avoid one-off thin tag pages
    const tagPages = [...tagCounts.entries()]
      .filter(([, count]) => count >= 2)
      .map(([tag]) => ({ url: `/tag/${encodeURIComponent(tag)}`, changefreq: 'weekly' as const, priority: 0.6 }));

    const authorPages = [...authorSlugs.values()].map(slug => ({
      url: `/author/${slug}`, changefreq: 'weekly' as const, priority: 0.6,
    }));

    const links = [
      ...STATIC_PAGES,
      ...tagPages,
      ...authorPages,
      ...posts.map(p => ({
        url:        `/blog/${p.slug || p._id}`,
        lastmod:    p.updatedAt,
        changefreq: 'weekly' as const,
        priority:   0.8,
      })),
      // Individual short pages — crawlable by Google, eligible for AdSense
      // Sponsored shorts excluded (paid content, not for indexing)
      ...shorts.filter(s => !s.isSponsored).map(s => ({
        url:        `/shorts/${s._id}`,
        lastmod:    s.updatedAt ?? s.createdAt,
        changefreq: 'weekly' as const,
        priority:   0.7,
      })),
    ];

    const stream = new SitemapStream({ hostname: SITE_ORIGIN });
    const xml = await streamToPromise(Readable.from(links).pipe(stream));

    sitemapCache   = xml;
    sitemapCachedAt = Date.now();

    res.setHeader('Content-Type', 'application/xml');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    return res.send(xml);
  } catch (err) {
    console.error('Sitemap generation failed:', err);
    return res.status(500).send('Sitemap unavailable');
  }
});

// 301 redirect: /blog/:objectId  →  /blog/:slug
// Prevents duplicate-content indexing of old MongoDB ObjectId URLs.
const OBJECT_ID_RE = /^[0-9a-f]{24}$/i;
const API_BASE = process.env['API_URL'] ?? 'https://apnablogserver.onrender.com/api';

app.get('/blog/:id', async (req: Request, res: Response, next: NextFunction) => {
  const id = String(req.params['id'] ?? '');
  if (!OBJECT_ID_RE.test(id)) return next(); // already a slug — let SSR handle it

  try {
    const apiRes = await fetch(`${API_BASE}/post/${id}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10000),
    });
    if (!apiRes.ok) return next();

    const body = await apiRes.json() as { data?: { slug?: string } };
    const slug = body?.data?.slug;
    if (slug && slug !== id) {
      return res.redirect(301, `/blog/${slug}`);
    }
  } catch {
    // API down or timeout — fall through to SSR so the page still loads
  }
  return next();
});

/**
 * Example Express Rest API endpoints can be defined here.
 * Uncomment and define endpoints as necessary.
 *
 * Example:
 * ```ts
 * app.get('/api/{*splat}', (req, res) => {
 *   // Handle API request
 * });
 * ```
 */

/**
 * Serve static files from /browser
 */
app.use(
  express.static(browserDistFolder, {
    maxAge: '1y',
    index: false,
    redirect: false,
  }),
);

/**
 * Handle all other requests by rendering the Angular application.
 */
app.use((req, res, next) => {
  // Rewrite loopback Host headers so Angular SSR's SSRF guard allows the
  // request. Production requests (Host: apnainsights.com) pass through as-is.
  if (isLoopback(req.headers['host'] ?? '')) {
    req.headers['host'] = PUBLIC_HOST;
  }

  angularApp
    .handle(req)
    .then((response) => {
      if (!response) {
        // RenderMode.Client route — Angular returns null, serve the SPA shell
        return res.sendFile(join(browserDistFolder, 'index.html'));
      }
      // If Angular SSR itself produced a 5xx (e.g. API timeout during render),
      // fall back to the client shell so the browser can bootstrap normally.
      if (response.status >= 500) {
        console.warn(`SSR returned ${response.status} for ${req.url} — falling back to client shell`);
        return res.status(200).sendFile(join(browserDistFolder, 'index.html'));
      }
      return writeResponseToNodeResponse(response, res);
    })
    .catch(next);
});

/**
 * When Angular SSR throws (e.g. API timeout during render), fall back to the
 * client-side shell so the browser can bootstrap and fetch data itself.
 * This prevents the hosting platform from showing its own "Something went wrong" error page.
 */
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error('SSR render error — falling back to client shell:', err);
  res.status(200).sendFile(join(browserDistFolder, 'index.html'));
});

/**
 * Start the server if this module is the main entry point, or it is ran via PM2.
 * The server listens on the port defined by the `PORT` environment variable, or defaults to 4000.
 */
// Fire-and-forget warmup: immediately kick the Render backend so it starts
// waking up on Vercel cold-start. The next SSR request will succeed.
fetch(`${API_BASE}/post?page=1&limit=1`, { signal: AbortSignal.timeout(30000) }).catch(() => {});

if (isMainModule(import.meta.url) || process.env['pm_id']) {
  const port = process.env['PORT'] || 4000;
  app.listen(port, (error) => {
    if (error) {
      throw error;
    }
  });

  // Keepalive: ping the backend every 10 minutes so Render's free-tier instance
  // stays warm and doesn't cold-start during AdSense / Googlebot crawls.
  setInterval(() => {
    fetch(`${API_BASE}/post?page=1&limit=1`, { signal: AbortSignal.timeout(15000) })
      .catch(() => {});
  }, 10 * 60 * 1000);
}

/**
 * Request handler used by the Angular CLI (for dev-server and during build) or Firebase Cloud Functions.
 */
export const reqHandler = createNodeRequestHandler(app);
