import { inject } from '@angular/core';
import { Router, CanActivateFn, ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { Auth } from '../services/auth';

export const roleGuard: CanActivateFn = (route: ActivatedRouteSnapshot, state: RouterStateSnapshot) => {
  const router = inject(Router);
  const authService = inject(Auth);

  const currentUser = authService.getCurrentUser();
  const urlId = route.paramMap.get('id');
  const requiredRole = route.data['role'];

  if (!currentUser || !currentUser.id) {
    router.navigate(['/auth/login']);
    return false;
  }

  if (currentUser.id !== urlId) {
    router.navigate(['/']);
    return false;
  }

  if (currentUser.role !== requiredRole) {
    router.navigate(['/']);
    return false;
  }

  return true;
};