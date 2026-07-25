import { formatCompactCount } from '../../shared/pipes/format-count-pipe';

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

/** Called by home.ts once it has the full published-post catalog, so every
 * other page can read real counts via readCachedSiteStats() above instead of
 * showing a fabricated placeholder number. */
export function writeCachedSiteStats(posts: { views?: number; categories?: string[] }[]): void {
  try {
    if (typeof localStorage === 'undefined' || !posts.length) return;
    const categoryCounts: Record<string, number> = {};
    let totalViews = 0;
    for (const post of posts) {
      totalViews += Number(post.views) || 0;
      for (const cat of post.categories ?? []) {
        categoryCounts[cat] = (categoryCounts[cat] ?? 0) + 1;
      }
    }
    localStorage.setItem(STATS_KEY, JSON.stringify({ total: posts.length, totalViews, categoryCounts }));
  } catch {
    // best-effort cache - a failed write just means the fallback pages show nothing, never a fake number
  }
}

// Same K/M rounding as FormatCountPipe (via formatCompactCount), adapted to
// this call site's "at least this many" convention: no trailing ".0", a
// lowercase "k" for thousands, and a "+" suffix once abbreviated.
export function formatStatCount(n: number): string {
  if (n < 1000) return n > 0 ? String(n) : '0';
  const compact = formatCompactCount(n).replace(/\.0(?=[KM]$)/, '');
  return (compact.endsWith('K') ? compact.slice(0, -1) + 'k' : compact) + '+';
}
