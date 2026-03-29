import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { Auth } from '../services/auth';

export const authGuard: CanActivateFn = () => {
  const authService = inject(Auth);
  const router = inject(Router);

  if (authService.isAuthorized()) {
    return true;
  }

  router.navigate(['/auth/login']);
  return false;
};

export const guestGuard: CanActivateFn = () => {
  const authService = inject(Auth);
  const router = inject(Router);

  if (!authService.isAuthorized()) {
    return true;
  }

  const userId = authService.userId();

  if (authService.isAdmin()) {
    router.navigate(['/admin', userId]);
  } else {
    router.navigate(['/user', userId]);
  }

  return false;
};