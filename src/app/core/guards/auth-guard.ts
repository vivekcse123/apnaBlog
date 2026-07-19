import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { Auth } from '../services/auth';

export const authGuard: CanActivateFn = (_route, state) => {
  const authService = inject(Auth);
  const router = inject(Router);

  if (authService.isAuthorized() && !authService.isTokenExpired()) {
    return true;
  }
  if (authService.isTokenExpired()) {
    authService.logout();
  }
  router.navigate(['/auth/login'], { queryParams: { returnUrl: state.url } });
  return false;
};

export const guestGuard: CanActivateFn = () => {
  const authService = inject(Auth);
  const router = inject(Router);

  if (!authService.isAuthorized()) {
    return true;
  }

  const userId = authService.userId();

  if (authService.isSuperAdmin()) {
    router.navigate(['/super-admin', userId]);
  } else if (authService.isAdmin()) {
    router.navigate(['/admin', userId]);
  } else if (authService.isSponsor()) {
    router.navigate(['/sponsor', userId]);
  } else {
    router.navigate(['/user', userId]);
  }

  return false;
};