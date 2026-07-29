// Mirrors blog-detail.ts's noindex rule for a post's own page (the
// `isThinPost` const inside the meta-tag-setting method, not the unrelated
// ad-hiding `isThinPost` computed signal, which uses a different threshold).
// A post is only worth submitting in a sitemap if its own page will actually
// render `index` — otherwise Search Console reports "Submitted URL marked
// noindex". Keep this in sync with blog-detail.ts if that rule ever changes.
//
// IMPORTANT: the sitemap's /api/post list endpoint never includes the full
// `content` field (it's stripped from list responses for payload size), so
// deriving word count from post.content here always evaluated to 0 and
// excluded almost every non-MCQ post from the sitemap - this is why nearly
// all blog posts were missing from sitemap.xml. `wordCount` is precomputed
// by the backend from the same content (posts.model.js's countWords(), run
// in the pre('save') hook) and IS present on list responses, so prefer it;
// only fall back to deriving from `content` for callers that do pass it.
export function isIndexablePost(post) {
  if (post.postType === 'mcq') return true;
  if (typeof post.wordCount === 'number') return post.wordCount >= 500;
  const plainText = (post.content ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  return plainText.split(/\s+/).filter(Boolean).length >= 500;
}
