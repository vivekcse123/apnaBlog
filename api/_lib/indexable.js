// Mirrors blog-detail.ts's noindex rule for a post's own page (the
// `isThinPost` const inside the meta-tag-setting method, not the unrelated
// ad-hiding `isThinPost` computed signal, which uses a different threshold).
// A post is only worth submitting in a sitemap if its own page will actually
// render `index` — otherwise Search Console reports "Submitted URL marked
// noindex". Keep this in sync with blog-detail.ts if that rule ever changes.
export function isIndexablePost(post) {
  if (post.postType === 'mcq') return true;
  const plainText = (post.content ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  return plainText.split(/\s+/).filter(Boolean).length >= 500;
}
