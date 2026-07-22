// Guards against javascript:/data: URIs and other non-http(s) schemes before
// a value sourced from admin-entered data (e.g. a scraped news item's source
// link) is ever used as an href or passed to window.open.
export function isSafeExternalUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}
