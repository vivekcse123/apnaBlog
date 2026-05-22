import { inject } from '@angular/core';
import { HttpInterceptorFn, HttpRequest, HttpHandlerFn, HttpErrorResponse } from '@angular/common/http';
import { catchError, throwError } from 'rxjs';
import { Router } from '@angular/router';
import { Auth } from '../services/auth';

let sessionExpiredToastShown = false; // module-level flag — one toast per expiry

export const authInterceptor: HttpInterceptorFn = (req: HttpRequest<unknown>, next: HttpHandlerFn) => {
  const authService = inject(Auth);
  const router      = inject(Router);
  const token       = authService.getToken();

  const authReq = token
    ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    : req;

  return next(authReq).pipe(
    catchError((error: HttpErrorResponse) => {
      const isExpiry = error.status === 401 ||
        (error.status === 403 && authService.isTokenExpired());

      if (isExpiry && authService.isAuthorized()) {
        // Only show toast once per session expiry — not for every concurrent 401
        if (!sessionExpiredToastShown) {
          sessionExpiredToastShown = true;
          showSessionToast();
          setTimeout(() => { sessionExpiredToastShown = false; }, 5000);
        }
        authService.logout();
        router.navigate(['/auth/login'], { queryParams: { reason: 'session_expired' } });
      }
      return throwError(() => error);
    })
  );
};

function showSessionToast(): void {
  const el = document.createElement('div');
  el.textContent = 'Your session expired. Please sign in again.';
  Object.assign(el.style, {
    position: 'fixed', bottom: '24px', left: '50%',
    transform: 'translateX(-50%)',
    background: 'rgba(17,24,39,.92)', color: '#fff',
    padding: '12px 24px', borderRadius: '99px',
    fontSize: '14px', fontWeight: '600',
    zIndex: '99999', pointerEvents: 'none',
    fontFamily: "'DM Sans', sans-serif",
    backdropFilter: 'blur(10px)',
    boxShadow: '0 4px 20px rgba(0,0,0,.25)',
    transition: 'opacity .3s ease',
  });
  document.body.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, 4000);
}