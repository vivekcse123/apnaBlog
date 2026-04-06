const { SitemapStream, streamToPromise } = require('sitemap');
const { Readable } = require('stream');

module.exports = async function handler(req, res) {
  try {
    let allPosts = [];

    // ✅ Abort if Render takes too long
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000); // 8 sec max

    try {
      let page = 1;
      let totalPages = 1;

      do {
        const response = await fetch(
          `https://apnablogserver.onrender.com/api/post?page=${page}&limit=100`,
          { signal: controller.signal }
        );

        if (!response.ok) throw new Error(`Backend fetch failed: ${response.status}`);

        const data = await response.json();
        const posts = Array.isArray(data.data) ? data.data : [];
        allPosts = [...allPosts, ...posts];
        totalPages = data.totalPages || 1;
        page++;

      } while (page <= totalPages);

    } catch (fetchErr) {
      // ✅ If Render is down/slow, continue with just static routes
      console.warn('Backend unavailable, serving static-only sitemap:', fetchErr.message);
    } finally {
      clearTimeout(timeout);
    }

    const staticLinks = [
      { url: '/welcome',       changefreq: 'daily',   priority: 1.0 },
      { url: '/welcome/about', changefreq: 'monthly', priority: 0.8 },
    ];

    const postLinks = allPosts.map(post => ({
      url:        `/blog/${post._id}`,
      changefreq: 'weekly',
      priority:    0.7,
      lastmod:     post.updatedAt,
    }));

    const stream = new SitemapStream({ hostname: 'https://apnablogs.vercel.app' });
    const xmlData = await streamToPromise(
      Readable.from([...staticLinks, ...postLinks]).pipe(stream)
    );

    res.setHeader('Content-Type', 'application/xml');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.status(200).send(xmlData.toString());

  } catch (err) {
    console.error('Sitemap error:', err.message);
    res.setHeader('Content-Type', 'text/plain');
    res.status(500).send(`Sitemap error: ${err.message}`);
  }
};