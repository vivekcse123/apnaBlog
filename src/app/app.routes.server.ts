import { RenderMode, ServerRoute } from '@angular/ssr';

const CATEGORIES = [
  'update', 'news', 'sports', 'entertainment', 'health', 'technology',
  'business', 'lifestyle', 'education', 'exercise', 'social', 'village',
];

export const serverRoutes: ServerRoute[] = [
  { path: '',               renderMode: RenderMode.Prerender },
  { path: 'about',          renderMode: RenderMode.Prerender },
  { path: 'advertise',      renderMode: RenderMode.Prerender },
  { path: 'privacy-policy', renderMode: RenderMode.Prerender },
  { path: 'terms',          renderMode: RenderMode.Prerender },
  { path: 'disclaimer',        renderMode: RenderMode.Prerender },
  { path: 'editorial-policy', renderMode: RenderMode.Prerender },
  { path: 'topics',         renderMode: RenderMode.Prerender },
  {
    path: 'category/:category',
    renderMode: RenderMode.Prerender,
    getPrerenderParams: async () => CATEGORIES.map(c => ({ category: c })),
  },
  { path: 'blog/:id',       renderMode: RenderMode.Server },
  { path: 'author/:id',    renderMode: RenderMode.Server },
  { path: 'tag/:tag',      renderMode: RenderMode.Server },
  { path: 'search',         renderMode: RenderMode.Server },
  { path: 'challenges',     renderMode: RenderMode.Server },
  { path: 'shorts',         renderMode: RenderMode.Server },
  { path: 'shorts/:id',     renderMode: RenderMode.Server },
  { path: 'auth/login',     renderMode: RenderMode.Client },
  { path: 'auth/register',  renderMode: RenderMode.Client },
  { path: '**',             renderMode: RenderMode.Client },
];
