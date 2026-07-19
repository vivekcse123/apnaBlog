import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { Auth } from '../services/auth';

export const sponsorGuard: CanActivateFn = (_route, state) => {
  const auth   = inject(Auth);
  const router = inject(Router);

  if (!auth.isAuthorized() || auth.isTokenExpired()) {
    if (auth.isTokenExpired()) auth.logout();
    router.navigate(['/auth/login'], { queryParams: { returnUrl: state.url } });
    return false;
  }

  const role   = auth.userRole();
  const userId = auth.userId();

  if (role === 'sponsor') return true;

  if (role === 'admin' || role === 'super_admin') {
    router.navigate(['/admin', userId]);
  } else {
    router.navigate(['/user', userId]);
  }
  return false;
};
