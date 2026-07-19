import { RenderMode, ServerRoute } from '@angular/ssr';
import { MOCK_EXPERTS } from './features/career-guides/data/mock-experts';

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
  { path: 'blog',           renderMode: RenderMode.Prerender },
  { path: 'write-and-earn', renderMode: RenderMode.Prerender },
  {
    path: 'category/:category',
    renderMode: RenderMode.Prerender,
    getPrerenderParams: async () => CATEGORIES.map(c => ({ category: c })),
  },
  { path: 'blog/:id',       renderMode: RenderMode.Server },
  { path: 'author/:id',    renderMode: RenderMode.Server },
  { path: 'tag/:tag',      renderMode: RenderMode.Server },
  { path: 'campaign/:id',  renderMode: RenderMode.Server },
  // Career Guides is a frontend-only UI prototype running on a fixed mock
  // dataset (features/career-guides/data/mock-experts.ts) - Prerender both,
  // enumerating the mock experts' slugs same as CATEGORIES above. Swap the
  // profile route to RenderMode.Server (like author/:id) once real experts
  // come from an API instead of a static import.
  { path: 'career-guides',           renderMode: RenderMode.Prerender },
  { path: 'career-guides/explore',   renderMode: RenderMode.Prerender },
  // Mentor-only, always shows live per-user data - never prerendered.
  { path: 'career-guides/dashboard', renderMode: RenderMode.Client },
  // Must precede 'career-guides/:expertId' - same static-before-dynamic
  // ordering requirement as app.routes.ts.
  { path: 'career-guides/become-an-instructor', renderMode: RenderMode.Prerender },
  {
    path: 'career-guides/:expertId',
    renderMode: RenderMode.Prerender,
    getPrerenderParams: async () => MOCK_EXPERTS.map(e => ({ expertId: e.slug })),
  },
  // 'search' and 'topics' now redirect to '/blog' (see app.routes.ts) - kept
  // as Server mode so the redirect resolves to a real HTTP redirect during
  // SSR instead of falling through to the client-only '**' route.
  { path: 'search',         renderMode: RenderMode.Server },
  { path: 'topics',         renderMode: RenderMode.Server },
  { path: 'challenges',     renderMode: RenderMode.Server },
  { path: 'shorts',         renderMode: RenderMode.Server },
  { path: 'shorts/:id',     renderMode: RenderMode.Server },
  { path: 'auth/login',     renderMode: RenderMode.Client },
  { path: 'auth/register',  renderMode: RenderMode.Client },
  { path: '**',             renderMode: RenderMode.Client },
];
