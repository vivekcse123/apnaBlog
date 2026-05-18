// Google News Sitemap — articles published in the last 72 hours
// Google News indexes within 48h; 72h window avoids gaps on slow-publish days.
// Only fetches page 1 (newest 100 posts) — far faster than paginating all posts,
// and sufficient since no site publishes 100+ articles per 3 days.
export default async function handler(req, res) {
  try {
    let posts = [];

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    try {
      const response = await fetch(
        'https://apnablogserver.onrender.com/api/post?page=1&limit=100',
        { signal: controller.signal }
      );
      if (!response.ok) throw new Error(`Backend ${response.status}`);
      const data = await response.json();
      posts = Array.isArray(data.data) ? data.data : [];
    } catch (e) {
      console.warn('News sitemap: backend unavailable:', e.message);
    } finally {
      clearTimeout(timeout);
    }

    const threeDaysAgo = Date.now() - 3 * 24 * 60 * 60 * 1000;

    const recentPosts = posts.filter(p =>
      p.status === 'published' &&
      p.title &&
      new Date(p.createdAt).getTime() >= threeDaysAgo
    );

    const escape = str =>
      String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

    const urls = recentPosts.map(post => {
      const loc  = `https://apnainsights.com/blog/${post.slug || post._id}`;
      const date = new Date(post.createdAt).toISOString();
      return `
  <url>
    <loc>${loc}</loc>
    <news:news>
      <news:publication>
        <news:name>ApnaInsights</news:name>
        <news:language>en</news:language>
      </news:publication>
      <news:publication_date>${date}</news:publication_date>
      <news:title>${escape(post.title)}</news:title>
    </news:news>
  </url>`;
    }).join('');

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">${urls}
</urlset>`;

    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=900, stale-while-revalidate=3600');
    res.status(200).send(xml);

  } catch (err) {
    console.error('News sitemap error:', err);
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.status(200).send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">
</urlset>`);
  }
}
