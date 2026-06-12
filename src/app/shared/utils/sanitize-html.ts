import sanitizeHtmlLib from 'sanitize-html';

const ALLOWED_TAGS = sanitizeHtmlLib.defaults.allowedTags.concat([
  'figure', 'figcaption', 'img', 'h1', 'h2',
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
  '*':    ['class'],
};

/**
 * Sanitizes rich-text post/comment HTML before it's marked trusted via
 * bypassSecurityTrustHtml(). Allows the formatting produced by the post
 * editor (tables, code blocks, inline images/figures) while stripping
 * scripts, event handlers, and other XSS vectors. Pure-JS — safe to run
 * both server-side (SSR) and in the browser.
 */
export function sanitizeHtml(html: string): string {
  return sanitizeHtmlLib(html ?? '', {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: ALLOWED_ATTRIBUTES,
    allowedSchemes: ['http', 'https', 'mailto'],
    allowProtocolRelative: true,
  });
}
