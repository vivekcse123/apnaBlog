import { RenderMode, ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  { path: '',              renderMode: RenderMode.Prerender },
  { path: 'about',        renderMode: RenderMode.Prerender },
  { path: 'auth/login',    renderMode: RenderMode.Client },
  { path: 'auth/register', renderMode: RenderMode.Client },
  { path: '**',            renderMode: RenderMode.Client },
];
