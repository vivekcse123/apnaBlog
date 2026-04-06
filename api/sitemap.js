const { SitemapStream, streamToPromise } = require('sitemap');
const { Readable } = require('stream');

module.exports = async function handler(req, res) {
  try {
    let allPosts = [];
    let page = 1;
    let totalPages = 1;

    // ✅ Fetch all pages
    do {
      const response = await fetch(`https://apnablogserver.onrender.com/api/post?page=${page}&limit=100`);

      if (!response.ok) {
        throw new Error(`Backend fetch failed: ${response.status}`);
      }

      const data = await response.json();

      // Your API uses { data: [...], totalPages: N }
      const posts = Array.isArray(data.data) ? data.data : [];
      allPosts = [...allPosts, ...posts];

      totalPages = data.totalPages || 1;
      page++;

    } while (page <= totalPages);

    console.log('Total posts fetched:', allPosts.length);

    // ✅ Static routes
    const staticLinks = [
      { url: '/welcome',       changefreq: 'daily',   priority: 1.0 },
      { url: '/welcome/about', changefreq: 'monthly', priority: 0.8 },
    ];

    // ✅ Dynamic blog routes
    const postLinks = allPosts.map(post => ({
      url:        `/blog/${post._id}`,
      changefreq: 'weekly',
      priority:    0.7,
      lastmod:     post.updatedAt,
    }));

    const allLinks = [...staticLinks, ...postLinks];

    const stream = new SitemapStream({ hostname: 'https://apnablogs.vercel.app' });
    const xmlData = await streamToPromise(Readable.from(allLinks).pipe(stream));

    res.setHeader('Content-Type', 'application/xml');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.status(200).send(xmlData.toString());

  } catch (err) {
    console.error('Sitemap error:', err.message);
    res.setHeader('Content-Type', 'text/plain');
    res.status(500).send(`Sitemap error: ${err.message}`);
  }
}