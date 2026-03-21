import { RenderMode, ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  { path: 'welcome',       renderMode: RenderMode.Prerender },
  { path: 'auth/login',    renderMode: RenderMode.Prerender },
  { path: 'auth/register', renderMode: RenderMode.Prerender },
  { path: '**',            renderMode: RenderMode.Client },
];