import { ApplicationConfig, ErrorHandler, provideBrowserGlobalErrorListeners, provideZonelessChangeDetection } from '@angular/core';
import {
  provideRouter,
  withPreloading,
  withInMemoryScrolling,
  withViewTransitions,
} from '@angular/router';

import { routes } from './app.routes';
import { provideClientHydration, withEventReplay, withHttpTransferCacheOptions } from '@angular/platform-browser';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { authInterceptor } from './core/interceptors/auth-interceptor';
import { dedupeInterceptor } from './core/interceptors/dedupe-interceptor';
import { errorLoggingInterceptor } from './core/interceptors/error-logging-interceptor';
import { SelectivePreloadingStrategy } from './core/services/selective-preloading-strategy';
import { GlobalErrorHandler } from './core/services/global-error-handler';
import { environment } from '../environments/environment';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    { provide: ErrorHandler, useClass: GlobalErrorHandler },
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
      // static shell indefinitely. `/shorts?...limit=...` (the homepage's
      // Shorts rail) has the exact same prerender-staleness problem, so it's
      // excluded the same way.
      //
      // `getUserById` (`/api/user/<id>`, no further path segments) carries
      // `isFollowing`/`followersCount` for the requesting user - but the auth
      // token lives in localStorage, which doesn't exist during SSR, so the
      // server always issues this request anonymously (isFollowing: false).
      // Without this exclusion, that anonymous SSR response gets replayed
      // verbatim on hydration instead of being re-fetched with the real
      // token, so the author-card Follow button always resets to "Follow"
      // on a full page reload even when the user is actually following.
      // This one applies in dev too - SSR never has the token regardless of
      // build mode - unlike the prerender-staleness exclusions below.
      //
      // The prerender-staleness exclusions (`/post?...limit=`, `/shorts?...limit=`,
      // `/challenge`) only apply in production. They exist because `ng build`
      // bakes Prerender routes (home, /blog, /category/*) into static HTML
      // once at deploy time, so the browser must always re-fetch live data on
      // hydration or it'd replay the same frozen response to every visitor
      // until the next deploy. In `ng serve`, there's no such build-time
      // snapshot - every reload is a genuinely fresh SSR render for that
      // exact request, so excluding these here only forces a redundant
      // duplicate fetch on hydration and makes local reloads feel slow.
      withHttpTransferCacheOptions({
        filter: (req) => !(
          (environment.production && (
            (req.url.includes('/post?') && req.url.includes('limit=')) ||
            (req.url.includes('/shorts?') && req.url.includes('limit=')) ||
            req.url.includes('/challenge') ||
            req.url.includes('/post/sponsored')
          )) ||
          /\/api\/user\/[^/?]+(\?.*)?$/.test(req.url)
        ),
      }),
    ),
    provideHttpClient(withFetch(), withInterceptors([dedupeInterceptor, errorLoggingInterceptor, authInterceptor])),
  ]
};
