import { RenderMode, ServerRoute } from '@angular/ssr';

const CATEGORIES = [
  'update', 'news', 'sports', 'entertainment', 'health', 'technology',
  'business', 'lifestyle', 'education', 'exercise', 'cooking', 'social',
  'quotes', 'village',
];

export const serverRoutes: ServerRoute[] = [
  { path: '',               renderMode: RenderMode.Prerender },
  { path: 'about',          renderMode: RenderMode.Prerender },
  { path: 'privacy-policy', renderMode: RenderMode.Prerender },
  { path: 'terms',          renderMode: RenderMode.Prerender },
  { path: 'disclaimer',     renderMode: RenderMode.Prerender },
  {
    path: 'category/:category',
    renderMode: RenderMode.Prerender,
    getPrerenderParams: async () => CATEGORIES.map(c => ({ category: c })),
  },
  { path: 'blog/:id',       renderMode: RenderMode.Server },
  { path: 'auth/login',     renderMode: RenderMode.Client },
  { path: 'auth/register',  renderMode: RenderMode.Client },
  { path: '**',             renderMode: RenderMode.Client },
];
