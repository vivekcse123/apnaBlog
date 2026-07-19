import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map, catchError, of } from 'rxjs';
import { Auth } from '../services/auth';
import { UserService } from '../../features/user/services/user-service';

// Approved mentors land on their dashboard instead of the public
// marketplace when they hit /career-guides directly - "Browse Experts" on
// the dashboard (routed to /career-guides/explore, which does NOT use this
// guard) is the escape hatch back to the marketplace view. Guests and
// regular users pass through untouched.
export const mentorRedirectGuard: CanActivateFn = () => {
  const auth = inject(Auth);
  const router = inject(Router);
  const userService = inject(UserService);

  if (!auth.isAuthorized()) return true;

  return userService.getUserById(auth.userId()).pipe(
    map(res => {
      if (res.data?.isMentor) {
        router.navigate(['/career-guides/dashboard']);
        return false;
      }
      return true;
    }),
    catchError(() => of(true)),
  );
};
