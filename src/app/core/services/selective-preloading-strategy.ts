import { Injectable } from '@angular/core';
import { PreloadingStrategy, Route } from '@angular/router';
import { Observable, of } from 'rxjs';

// Skips preloading for any route gated by an auth guard (admin, user,
// super-admin, sponsor, auth/login-register) - these are large, role-specific
// bundles (250-700kB+) that most anonymous visitors never open. Lighthouse
// flagged >1MB of "unused JavaScript" on first load because PreloadAllModules
// fetched all of them in the background regardless. Public content routes
// (blog, category, tag, author, shorts, etc.) still preload as normal.
@Injectable({ providedIn: 'root' })
export class SelectivePreloadingStrategy implements PreloadingStrategy {
  preload(route: Route, load: () => Observable<unknown>): Observable<unknown> {
    if (route.canActivate?.length) return of(null);
    return load();
  }
}
