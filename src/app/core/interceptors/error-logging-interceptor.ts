import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { catchError, throwError } from 'rxjs';

// Central visibility into failed API calls - most components swallow HTTP
// errors into an empty/default state (deliberately, for feed-style UIs), so
// without this a failing endpoint produces no signal anywhere. Logs and
// rethrows unchanged - never alters response/error data, so existing
// per-service catchError chains behave exactly as before.
export const errorLoggingInterceptor: HttpInterceptorFn = (req, next) => {
  return next(req).pipe(
    catchError((err: HttpErrorResponse) => {
      console.error(`[HTTP ${err.status || 'ERR'}] ${req.method} ${req.urlWithParams}`, err.error?.message ?? err.message);
      return throwError(() => err);
    })
  );
};
