import { ApplicationConfig, provideBrowserGlobalErrorListeners, provideZonelessChangeDetection } from '@angular/core';
import {
  provideRouter,
  withPreloading,
  withInMemoryScrolling,
  withViewTransitions,
} from '@angular/router';

import { routes } from './app.routes';
import { provideClientHydration, withEventReplay, withHttpTransferCacheOptions } from '@angular/platform-browser';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { loaderInterceptor } from './core/interceptors/loader-interceptor';
import { authInterceptor } from './core/interceptors/auth-interceptor';
import { dedupeInterceptor } from './core/interceptors/dedupe-interceptor';
import { SelectivePreloadingStrategy } from './core/services/selective-preloading-strategy';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideRouter(
      routes,
      withPreloading(SelectivePreloadingStrategy),
      withInMemoryScrolling({
        scrollPositionRestoration: 'enabled',
        anchorScrolling: 'enabled',
      }),
      withViewTransitions(),
    ),
    provideClientHydration(
      withEventReplay(),
      // Post-list requests (getAllPost/getStatsPage/getAllPublished - all hit
      // `/post?page=...&limit=...`) would otherwise be serialized in full,
      // including every post's HTML content, into an inline <script> for
      // hydration - bloating prerendered pages by hundreds of KB to ~1.4MB.
      // Excluding them from the transfer cache keeps SSR rendering (and SEO
      // content) intact; the browser just re-fetches the list on hydration.
      // Single-post requests (getPostById, etc.) don't match and stay cached.
      //
      // `/challenge` is excluded for a different reason: the home page (`''`)
      // is RenderMode.Prerender (app.routes.server.ts), so it's built once
      // at deploy time - any request left in the transfer cache gets replayed
      // verbatim to every visitor until the next deploy. A time-bound resource
      // like the active monthly challenge must always be re-checked against
      // the live API on hydration, or an ended challenge keeps showing on the
      // static shell indefinitely.
      withHttpTransferCacheOptions({
        filter: (req) => !(
          (req.url.includes('/post?') && req.url.includes('limit=')) ||
          req.url.includes('/challenge')
        ),
      }),
    ),
    provideHttpClient(withFetch(), withInterceptors([dedupeInterceptor, loaderInterceptor, authInterceptor])),
  ]
};
