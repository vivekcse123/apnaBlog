// Single source of truth for category chip colors, site-wide. Previously
// duplicated verbatim in home.ts, blog-list.ts and site-header.ts - any edit
// to the palette/overrides had to be made in all 3 places or categories
// would render a different color depending which page you were on.
//
// Named categories get a fixed, intentional hue; anything else falls back to
// a deterministic hash into the same palette so it's still distinct and
// consistent across renders instead of just defaulting to grey.
const CATEGORY_COLOR_PALETTE = [
  '#3B82F6', '#8B5CF6', '#10B981', '#EF4444',
  '#F97316', '#EC4899', '#06B6D4', '#F59E0B',
];

const CATEGORY_COLOR_OVERRIDES: Record<string, string> = {
  technology: '#3B82F6', ai: '#8B5CF6', career: '#10B981',
  news: '#EF4444', health: '#EC4899', sports: '#10B981',
  business: '#F97316', lifestyle: '#8B5CF6', education: '#3B82F6',
};

export function categoryColorFor(name: string): string {
  const key = name.toLowerCase();
  if (CATEGORY_COLOR_OVERRIDES[key]) return CATEGORY_COLOR_OVERRIDES[key];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return CATEGORY_COLOR_PALETTE[Math.abs(hash) % CATEGORY_COLOR_PALETTE.length];
}
