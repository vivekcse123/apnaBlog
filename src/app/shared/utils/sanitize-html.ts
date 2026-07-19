import sanitizeHtmlLib from 'sanitize-html';

// 'h1' is intentionally excluded - the page template owns the single H1 (the
// post title). Contributor-typed h1s are downgraded to h2 (see transformTags
// below) instead of allowed through verbatim, which used to produce 2-3 H1s
// per page and a diluted heading hierarchy for SEO/screen readers.
const ALLOWED_TAGS = sanitizeHtmlLib.defaults.allowedTags.concat([
  'figure', 'figcaption', 'img', 'h2',
]);

const ALLOWED_ATTRIBUTES = {
  ...sanitizeHtmlLib.defaults.allowedAttributes,
  a:      ['href', 'title', 'target', 'rel'],
  img:    ['src', 'alt', 'width', 'height', 'loading'],
  pre:    ['data-language'],
  code:   ['data-language'],
  figure: ['class', 'contenteditable'],
  td:     ['colspan', 'rowspan'],
  th:     ['colspan', 'rowspan'],
  table:  ['border', 'cellpadding', 'cellspacing'],
  // 'id' is required on h2/h3/h4 so the ToC sidebar's scroll-to-heading and
  // scroll-spy highlighting (blog-detail.ts _processHeadings) survive
  // sanitization - otherwise every heading id gets stripped here.
  h2:     ['id'],
  h3:     ['id'],
  h4:     ['id'],
  '*':    ['class'],
};

/**
 * Sanitizes rich-text post/comment HTML before it's marked trusted via
 * bypassSecurityTrustHtml(). Allows the formatting produced by the post
 * editor (tables, code blocks, inline images/figures) while stripping
 * scripts, event handlers, and other XSS vectors. Pure-JS - safe to run
 * both server-side (SSR) and in the browser.
 */
export function sanitizeHtml(html: string): string {
  return sanitizeHtmlLib(html ?? '', {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: ALLOWED_ATTRIBUTES,
    allowedSchemes: ['http', 'https', 'mailto'],
    allowProtocolRelative: true,
    transformTags: { h1: 'h2' },
    // Discard button tags AND their inner text (e.g. inline-img-remove ✕ buttons
    // stored in older posts before source-level stripping was added).
    nonTextTags: ['style', 'script', 'textarea', 'noscript', 'button'],
  });
}
