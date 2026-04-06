const { SitemapStream, streamToPromise } = require('sitemap');
const { Readable } = require('stream');

export default async function handler(req, res) {
  try {

    const response = await fetch('https://apnablogserver.onrender.com/api/post');
    const data = await response.json();
    const posts = data.posts || data;

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
    console.error('Sitemap error:', err);
    res.status(500).end();
  }
}