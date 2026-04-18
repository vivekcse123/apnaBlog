import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { Auth } from '../services/auth';

export const superAdminGuard: CanActivateFn = () => {
  const authService = inject(Auth);
  const router = inject(Router);
  const userId = authService.userId();

  if (!authService.isAuthorized()) {
    router.navigate(['/auth/login']);
    return false;
  }

  if (authService.isSuperAdmin()) {
    return true;
  }

  if (authService.isAdmin()) {
    router.navigate(['/admin', userId]);
    return false;
  }

  router.navigate(['/user', userId]);
  return false;
};
