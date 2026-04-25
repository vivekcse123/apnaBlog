// Vercel serverless function — runs Angular SSR for /blog/:id routes.
//
// SEO redirect: if the URL still uses a MongoDB ObjectId (24 hex chars) instead
// of a human-readable slug, we fetch the slug from the backend and issue a
// permanent 301. This collapses the old indexed /blog/<id> URLs into the new
// /blog/<slug> canonical URLs without waiting months for Google to follow hints.

const MONGO_ID_RE  = /^[0-9a-f]{24}$/i;
const BACKEND_ROOT = 'https://apnablogserver.onrender.com/api';

// Cache the SSR handler across warm invocations — avoids re-importing on every request.
let _reqHandler = null;
async function getReqHandler() {
  if (!_reqHandler) {
    const mod = await import('../dist/blog-app/server/server.mjs');
    _reqHandler = mod.reqHandler;
  }
  return _reqHandler;
}

export default async function handler(req, res) {
  const urlPath = req.url?.split('?')[0] ?? '';
  const segments = urlPath.split('/').filter(Boolean);

  // ObjectId → slug permanent redirect (SEO: collapse old /blog/<id> URLs)
  if (segments[0] === 'blog' && segments[1] && MONGO_ID_RE.test(segments[1])) {
    const postId = segments[1];
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 4000);
      const apiRes = await fetch(`${BACKEND_ROOT}/post/${postId}`, { signal: controller.signal });
      clearTimeout(timer);
      if (apiRes.ok) {
        const { data: post } = await apiRes.json();
        if (post?.slug && post.slug !== postId) {
          res.setHeader('Location', `/blog/${post.slug}`);
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          res.status(301).end();
          return;
        }
      }
    } catch {
      // Backend unavailable or timeout — fall through to SSR
    }
  }

  // Angular SSR — wrapped in try/catch so a component crash returns a clean 500
  // instead of leaving the Vercel function hanging or returning garbled output.
  try {
    const reqHandler = await getReqHandler();
    return await reqHandler(req, res);
  } catch (err) {
    console.error('[SSR] reqHandler threw:', err);
    if (!res.headersSent) {
      res.status(500).send(
        '<!doctype html><html><body><h1>Something went wrong.</h1>' +
        '<p>Please try refreshing the page.</p></body></html>'
      );
    }
  }
}
