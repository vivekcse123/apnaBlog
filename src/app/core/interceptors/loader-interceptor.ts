import { HttpInterceptorFn } from '@angular/common/http';

// Global HTTP loader removed — components manage their own loading states.
// Keeping this file to avoid breaking the import in app.config.ts.
export const loaderInterceptor: HttpInterceptorFn = (req, next) => next(req);