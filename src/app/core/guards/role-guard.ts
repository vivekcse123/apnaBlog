import { inject } from '@angular/core';
import { Router, CanActivateFn, ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { Auth } from '../services/auth';

export const roleGuard: CanActivateFn = (route: ActivatedRouteSnapshot, state: RouterStateSnapshot) => {
  const router = inject(Router);
  const authService = inject(Auth);

  const currentUser = authService.getCurrentUser();
  const urlId = route.paramMap.get('id');
  const requiredRole = route.data['role'];

  if (!currentUser || !currentUser.id || authService.isTokenExpired()) {
    if (authService.isTokenExpired()) authService.logout();
    router.navigate(['/auth/login'], { queryParams: { returnUrl: state.url } });
    return false;
  }

  if (currentUser.id !== urlId) {
    router.navigate(['/']);
    return false;
  }

  // Higher-privilege roles inherit access to lower-privilege routes for
  // their own id (already locked down by the identity check above) -
  // e.g. super_admin inherits admin routes, and admin/super_admin inherit
  // user routes so an admin account that's also a mentor can still reach
  // its own /user/:id/career-guides/* pages.
  const roleMatches =
    currentUser.role === requiredRole ||
    (requiredRole === 'admin' && currentUser.role === 'super_admin') ||
    (requiredRole === 'user' && (currentUser.role === 'admin' || currentUser.role === 'super_admin'));

  if (!roleMatches) {
    router.navigate(['/']);
    return false;
  }

  return true;
};