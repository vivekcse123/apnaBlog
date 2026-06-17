export default async function handler(req, res) {
  try {
    let allPosts = [];

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
        if (!response.ok) throw new Error(`Backend ${response.status}`);
        const data = await response.json();
        allPosts = allPosts.concat(Array.isArray(data.data) ? data.data : []);
        totalPages = data.totalPages || 1;
        page++;
      } while (page <= totalPages);
    } catch (e) {
      console.warn('RSS: backend unavailable:', e.message);
    } finally {
      clearTimeout(timeout);
    }

    const published = allPosts
      .filter(p => p.status === 'published' && p.title && !p.isSponsored)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 50);

    const escape = str =>
      String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');

    const stripHtml = str => String(str ?? '').replace(/<[^>]*>/g, '').trim();

    const items = published.map(post => {
      const url  = `https://apnainsights.com/blog/${post.slug || post._id}`;
      const date = new Date(post.updatedAt || post.createdAt).toUTCString();
      const desc = escape(post.description || stripHtml(post.content).slice(0, 200));
      const author = escape((post.user?.name) || 'ApnaInsights');
      const category = post.categories?.[0] ? `<category>${escape(post.categories[0])}</category>` : '';
      const image = post.featuredImage
        ? `<enclosure url="${escape(post.featuredImage)}" type="image/jpeg" length="0"/>`
        : '';

      return `
    <item>
      <title>${escape(post.title)}</title>
      <link>${url}</link>
      <guid isPermaLink="true">${url}</guid>
      <description>${desc}</description>
      <author>noreply@apnainsights.com (${author})</author>
      ${category}
      <pubDate>${date}</pubDate>
      ${image}
    </item>`;
    }).join('');

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
  xmlns:atom="http://www.w3.org/2005/Atom"
  xmlns:content="http://purl.org/rss/1.0/modules/content/"
  xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>ApnaInsights — Practical Knowledge for Everyday Life</title>
    <link>https://apnainsights.com</link>
    <description>India's practical knowledge platform — expert guides on Technology, Career, Health, Business, Lifestyle and more.</description>
    <language>en-IN</language>
    <copyright>© ${new Date().getFullYear()} ApnaInsights</copyright>
    <managingEditor>supports@apnainsights.com (ApnaInsights)</managingEditor>
    <webMaster>supports@apnainsights.com (ApnaInsights)</webMaster>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <ttl>60</ttl>
    <image>
      <url>https://apnainsights.com/web-app-manifest-512x512.png</url>
      <title>ApnaInsights</title>
      <link>https://apnainsights.com</link>
    </image>
    <atom:link href="https://apnainsights.com/api/rss" rel="self" type="application/rss+xml"/>
    ${items}
  </channel>
</rss>`;

    res.setHeader('Content-Type', 'application/rss+xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
    res.status(200).send(xml);

  } catch (err) {
    console.error('RSS error:', err);
    res.setHeader('Content-Type', 'application/rss+xml; charset=utf-8');
    res.status(200).send(`<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
  <title>ApnaInsights</title>
  <link>https://apnainsights.com</link>
  <description>ApnaInsights RSS Feed</description>
</channel></rss>`);
  }
}
