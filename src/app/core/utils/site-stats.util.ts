// Reads the real site stats that home.ts persists to localStorage after its
// full-catalog stats fetch (key/shape must stay in sync with home.ts's
// STATS_KEY / persistStats). Used by pages that want to show real "N articles"
// style numbers without re-fetching the whole catalog themselves - and, just
// as importantly, without ever falling back to a made-up placeholder number.
const STATS_KEY = 'apna_site_stats_v3';

export interface CachedSiteStats {
  articles: number;
  topics: number;
  reads: number;
}

export function readCachedSiteStats(): CachedSiteStats | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(STATS_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    const articles = Number(p.total) || 0;
    const reads    = Number(p.totalViews) || 0;
    const topics   = p.categoryCounts && typeof p.categoryCounts === 'object'
      ? Object.keys(p.categoryCounts).length
      : 0;
    return articles > 0 ? { articles, topics, reads } : null;
  } catch {
    return null;
  }
}

export function formatStatCount(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M+';
  if (n >= 1_000)     return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'k+';
  return n > 0 ? String(n) : '0';
}
