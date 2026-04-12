import { ApplicationConfig, provideBrowserGlobalErrorListeners, provideZonelessChangeDetection } from '@angular/core';
import {
  provideRouter,
  withPreloading,
  PreloadAllModules,
  withInMemoryScrolling,
  withViewTransitions,
} from '@angular/router';

import { routes } from './app.routes';
import { provideClientHydration, withEventReplay } from '@angular/platform-browser';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { loaderInterceptor } from './core/interceptors/loader-interceptor';
import { authInterceptor } from './core/interceptors/auth-interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideRouter(
      routes,
      // Eagerly preload lazy feature modules in the background after initial load
      withPreloading(PreloadAllModules),
      // Restore scroll position when navigating back, and enable anchor scrolling
      withInMemoryScrolling({
        scrollPositionRestoration: 'enabled',
        anchorScrolling: 'enabled',
      }),
      // Native browser View Transitions API for smooth page-to-page animations
      withViewTransitions(),
    ),
    provideClientHydration(withEventReplay()),
    provideHttpClient(withFetch(), withInterceptors([loaderInterceptor, authInterceptor])),
  ]
};
