import { RenderMode, ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  { path: '',              renderMode: RenderMode.Prerender },
  { path: 'about',        renderMode: RenderMode.Prerender },
  { path: 'auth/login',    renderMode: RenderMode.Prerender },
  { path: 'auth/register', renderMode: RenderMode.Prerender },
  { path: '**',            renderMode: RenderMode.Client },
];
