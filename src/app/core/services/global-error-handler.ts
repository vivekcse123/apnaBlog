import { ErrorHandler, Injectable, Injector, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ToastService } from './toast.service';

// Angular's default ErrorHandler only console.errors uncaught exceptions -
// nothing surfaces to the user and nothing is centrally logged. This
// replaces it so a genuine app crash (not a handled HTTP error - those
// already show their own messages via each component's catchError) at
// least tells the user something broke instead of failing silently.
@Injectable({ providedIn: 'root' })
export class GlobalErrorHandler implements ErrorHandler {
  private platformId = inject(PLATFORM_ID);
  // Injector, not a direct ToastService inject - avoids a circular DI error
  // since ErrorHandler is constructed very early in the bootstrap process.
  private injector = inject(Injector);

  handleError(error: unknown): void {
    if (error instanceof HttpErrorResponse) {
      // Already surfaced via the interceptor / the component's own error
      // handler - don't double-report or toast on top of that.
      console.error('[GlobalError] Unhandled HTTP error:', error.status, error.url);
      return;
    }

    console.error('[GlobalError]', error);

    if (isPlatformBrowser(this.platformId)) {
      try {
        this.injector.get(ToastService).show('Something went wrong. Please refresh the page.', 'error');
      } catch {
        // ToastService unavailable (e.g. very early bootstrap failure) - the
        // console.error above is still the source of truth for debugging.
      }
    }
  }
}
