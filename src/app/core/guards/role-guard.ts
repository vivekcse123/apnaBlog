import { inject } from '@angular/core';
import { Router, CanActivateFn, ActivatedRouteSnapshot } from '@angular/router';
import { Auth } from '../services/auth';

export const roleGuard: CanActivateFn = (route: ActivatedRouteSnapshot) => {
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
    authService.logout();
    router.navigate(['/auth/login'], {
      queryParams: { 
        error: 'Access Denied',
        message: 'You are not authorized to access this resource'
      }
    });
    return false;
  }

  if (currentUser.role !== requiredRole) {
    authService.logout();
    router.navigate(['/auth/login'], {
      queryParams: { 
        error: 'Access Denied',
        message: 'You do not have permission to access this area'
      }
    });
    return false;
  }
  return true;
};