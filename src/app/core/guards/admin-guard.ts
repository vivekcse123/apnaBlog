import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { Auth } from '../services/auth';

export const adminGuard: CanActivateFn = (_route, state) => {
  const authService = inject(Auth);
  const router = inject(Router);

  const userId = authService.userId();

  if (!authService.isAuthorized() || authService.isTokenExpired()) {
    if (authService.isTokenExpired()) authService.logout();
    router.navigate(['/auth/login'], { queryParams: { returnUrl: state.url } });
    return false;
  }

  if (authService.isAdmin()) {
    return true;
  }

  if (authService.isSuperAdmin()) {
    router.navigate(['/super-admin', userId]);
    return false;
  }

  router.navigate(['/user', userId]);
  return false;
};