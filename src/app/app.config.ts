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
      // Post-list requests (getAllPost/getStatsPage/getAllPublished — all hit
      // `/post?page=...&limit=...`) would otherwise be serialized in full,
      // including every post's HTML content, into an inline <script> for
      // hydration — bloating prerendered pages by hundreds of KB to ~1.4MB.
      // Excluding them from the transfer cache keeps SSR rendering (and SEO
      // content) intact; the browser just re-fetches the list on hydration.
      // Single-post requests (getPostById, etc.) don't match and stay cached.
      withHttpTransferCacheOptions({
        filter: (req) => !(req.url.includes('/post?') && req.url.includes('limit=')),
      }),
    ),
    provideHttpClient(withFetch(), withInterceptors([dedupeInterceptor, loaderInterceptor, authInterceptor])),
  ]
};
