import { SitemapStream, streamToPromise } from 'sitemap';
import { Readable } from 'stream';

export default async function handler(req, res) {
  try {
    let allPosts = [];
    let allShorts = [];

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    try {
      let page = 1;
      let totalPages = 1;

      do {
        const response = await fetch(
          `https://apnablogserver.onrender.com/api/post?page=${page}&limit=100`,
          { signal: controller.signal }
        );

        if (!response.ok) {
          throw new Error(`Backend fetch failed: ${response.status}`);
        }

        const data = await response.json();
        const posts = Array.isArray(data.data) ? data.data : [];

        allPosts = allPosts.concat(posts);
        totalPages = data.totalPages || 1;
        page++;

      } while (page <= totalPages);

    } catch (fetchErr) {
      console.warn(
        'Backend unavailable, serving static-only sitemap:',
        fetchErr.message
      );
    }

    try {
      let page = 1;
      let totalPages = 1;

      do {
        const response = await fetch(
          `https://apnablogserver.onrender.com/api/shorts?status=published&page=${page}&limit=100`,
          { signal: controller.signal }
        );

        if (!response.ok) {
          throw new Error(`Backend fetch failed: ${response.status}`);
        }

        const data = await response.json();
        const shorts = Array.isArray(data.data) ? data.data : [];

        allShorts = allShorts.concat(shorts);
        totalPages = data.totalPages || 1;
        page++;

      } while (page <= totalPages);

    } catch (fetchErr) {
      console.warn(
        'Backend unavailable, omitting shorts from sitemap:',
        fetchErr.message
      );
    } finally {
      clearTimeout(timeout);
    }

    // Static routes
    const staticLinks = [
      { url: '/',               changefreq: 'daily',   priority: 1.0, lastmod: new Date().toISOString() },
      { url: '/about',          changefreq: 'monthly', priority: 0.8, lastmod: '2026-01-01T00:00:00.000Z' },
      { url: '/advertise',      changefreq: 'monthly', priority: 0.7, lastmod: new Date().toISOString() },
      { url: '/topics',         changefreq: 'weekly',  priority: 0.7, lastmod: new Date().toISOString() },
      { url: '/challenges',     changefreq: 'weekly',  priority: 0.6, lastmod: new Date().toISOString() },
      { url: '/shorts',         changefreq: 'hourly',  priority: 0.9, lastmod: new Date().toISOString() },
      { url: '/privacy-policy', changefreq: 'yearly',  priority: 0.3, lastmod: '2026-04-01T00:00:00.000Z' },
      { url: '/terms',          changefreq: 'yearly',  priority: 0.3, lastmod: '2026-04-01T00:00:00.000Z' },
      { url: '/disclaimer',        changefreq: 'yearly',  priority: 0.3, lastmod: '2026-04-24T00:00:00.000Z' },
      { url: '/editorial-policy', changefreq: 'yearly',  priority: 0.5, lastmod: '2026-06-01T00:00:00.000Z' },
      { url: '/category/update',        changefreq: 'daily',  priority: 0.6, lastmod: new Date().toISOString() },
      { url: '/category/news',          changefreq: 'daily',  priority: 0.6, lastmod: new Date().toISOString() },
      { url: '/category/sports',        changefreq: 'weekly', priority: 0.6, lastmod: new Date().toISOString() },
      { url: '/category/entertainment', changefreq: 'weekly', priority: 0.6, lastmod: new Date().toISOString() },
      { url: '/category/health',        changefreq: 'weekly', priority: 0.6, lastmod: new Date().toISOString() },
      { url: '/category/technology',    changefreq: 'weekly', priority: 0.6, lastmod: new Date().toISOString() },
      { url: '/category/business',      changefreq: 'weekly', priority: 0.6, lastmod: new Date().toISOString() },
      { url: '/category/lifestyle',     changefreq: 'weekly', priority: 0.6, lastmod: new Date().toISOString() },
      { url: '/category/education',     changefreq: 'weekly', priority: 0.6, lastmod: new Date().toISOString() },
      { url: '/category/exercise',      changefreq: 'weekly', priority: 0.6, lastmod: new Date().toISOString() },
      { url: '/category/cooking',       changefreq: 'weekly', priority: 0.6, lastmod: new Date().toISOString() },
      { url: '/category/social',        changefreq: 'weekly', priority: 0.6, lastmod: new Date().toISOString() },
      { url: '/category/quotes',        changefreq: 'weekly', priority: 0.6, lastmod: new Date().toISOString() },
      { url: '/category/village',       changefreq: 'weekly', priority: 0.6, lastmod: new Date().toISOString() },
    ];

    // Dynamic blog routes — published posts only
    const publishedPosts = allPosts.filter(post => post.status === 'published' && post.title);

    // Collect unique tags and author post counts
    const tagCounts = new Map();
    const authorCounts = new Map();
    for (const post of publishedPosts) {
      for (const tag of (post.tags ?? [])) {
        tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
      }
      if (post.user?._id) {
        authorCounts.set(post.user._id, (authorCounts.get(post.user._id) ?? 0) + 1);
      }
    }

    // Threshold must match tag-page.ts's noindex cutoff (count >= 5) so the
    // sitemap never submits URLs that immediately render noindex.
    const tagLinks = [...tagCounts.entries()]
      .filter(([, count]) => count >= 5)
      .map(([tag]) => ({ url: `/tag/${encodeURIComponent(tag)}`, changefreq: 'weekly', priority: 0.6 }));

    // Use MongoDB _id for author URLs — author-page.ts fetches by getUserById(id).
    // Threshold must match author-page.ts's noindex cutoff (>= 3 published posts).
    const authorLinks = [...authorCounts.entries()]
      .filter(([, count]) => count >= 3)
      .map(([id]) => ({ url: `/author/${id}`, changefreq: 'weekly', priority: 0.6 }));

    const postLinks = publishedPosts.map(post => {
      const entry = {
        url: `/blog/${post.slug || post._id}`,
        changefreq: 'weekly',
        priority: 0.7,
        lastmod: post.updatedAt || post.createdAt || new Date().toISOString(),
      };
      if (post.featuredImage) {
        entry.img = [{
          url: post.featuredImage,
          title: post.title,
          caption: post.description || post.title,
        }];
      }
      return entry;
    });

    // Individual short pages — crawlable by Google, eligible for AdSense.
    // Sponsored shorts excluded (paid content, not for indexing).
    const shortLinks = allShorts
      .filter(s => s.status === 'published' && !s.isSponsored)
      .map(s => ({
        url:        `/shorts/${s._id}`,
        changefreq: 'weekly',
        priority:   0.7,
        lastmod:    s.updatedAt || s.createdAt || new Date().toISOString(),
      }));

    const stream = new SitemapStream({
      hostname: 'https://apnainsights.com'
    });

    const xmlData = await streamToPromise(
      Readable.from([...staticLinks, ...tagLinks, ...authorLinks, ...postLinks, ...shortLinks]).pipe(stream)
    );

    res.setHeader('Content-Type', 'application/xml');
    res.setHeader('Cache-Control', 'public, max-age=3600');

    res.status(200).send(xmlData.toString());

  } catch (err) {
    console.error('Sitemap error:', err);

    // Return a minimal valid sitemap so Google never gets an error page
    const fallback = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://apnainsights.com/</loc><changefreq>daily</changefreq><priority>1.0</priority></url>
  <url><loc>https://apnainsights.com/about</loc><changefreq>monthly</changefreq><priority>0.8</priority></url>
</urlset>`;
    res.setHeader('Content-Type', 'application/xml');
    res.status(200).send(fallback);
  }
}
