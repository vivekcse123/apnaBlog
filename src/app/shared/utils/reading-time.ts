import { Post } from '../../core/models/post.model';

// Same ~200wpm fallback formula previously duplicated verbatim in
// blog-list.ts, category-page.ts and tag-page.ts. List endpoints omit the
// full `content` body for payload size, so `readingTimeMinutes` (precomputed
// by the backend) is used whenever it's present; the word-count fallback
// only kicks in for posts loaded with their full content.
export function estimateReadingTimeMinutes(post: Post): number {
  if (post.readingTimeMinutes) return post.readingTimeMinutes;
  const words = (post.content ?? '').replace(/<[^>]*>/g, '').trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 200));
}
