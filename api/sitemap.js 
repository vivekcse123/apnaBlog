const { SitemapStream, streamToPromise } = require('sitemap');
const { Readable } = require('stream');

module.exports = async function handler(req, res) {
  try {
    // ✅ Fetch posts from backend
    const response = await fetch('https://apnablogserver.onrender.com/api/post');

    // ✅ Check if fetch was successful
    if (!response.ok) {
      throw new Error(`Backend fetch failed: ${response.status}`);
    }

    const data = await response.json();

    // ✅ Log to see actual shape of data
    console.log('API response keys:', Object.keys(data));

    // ✅ Handle different response shapes
    let posts = [];
    if (Array.isArray(data)) {
      posts = data;
    } else if (Array.isArray(data.posts)) {
      posts = data.posts;
    } else if (Array.isArray(data.data)) {
      posts = data.data;
    }

    console.log('Total posts found:', posts.length);

    // ✅ Static routes
    const staticLinks = [
      { url: '/welcome',       changefreq: 'daily',   priority: 1.0 },
      { url: '/welcome/about', changefreq: 'monthly', priority: 0.8 },
    ];

    // ✅ Dynamic blog routes
    const postLinks = posts.map(post => ({
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
    // ✅ Return error as plain text so we can see it
    console.error('Sitemap error:', err.message);
    res.setHeader('Content-Type', 'text/plain');
    res.status(500).send(`Sitemap error: ${err.message}`);
  }
}