import { inject } from '@angular/core';
import { Router, CanActivateFn, ActivatedRouteSnapshot } from '@angular/router';

export const roleGuard: CanActivateFn = (route: ActivatedRouteSnapshot) => {
  const router = inject(Router);

  const currentUserId = localStorage.getItem('userId');
  const currentUserRole = localStorage.getItem('role');
  const urlId = route.paramMap.get('id');
  const requiredRole = route.data['role'];

  if (!currentUserId) {
    router.navigate(['/auth/login']);
    return false;
  }

  if (currentUserId !== urlId) {
    if (currentUserRole === 'admin') {
      router.navigate([`/admin/${currentUserId}`]);
    } else {
      router.navigate([`/user/${currentUserId}`]);
    }
    return false;
  }

  if (currentUserRole !== requiredRole) {
    if (currentUserRole === 'admin') {
      router.navigate([`/admin/${currentUserId}`]);
    } else {
      router.navigate([`/user/${currentUserId}`]);
    }
    return false;
  }

  return true;
};