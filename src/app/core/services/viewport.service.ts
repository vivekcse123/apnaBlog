import { Injectable, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

const MOBILE_QUERY = '(max-width: 768px)';

/** Single shared `(max-width: 768px)` match - avoids every component that
 * needs a mobile/desktop split wiring up its own matchMedia listener. */
@Injectable({ providedIn: 'root' })
export class ViewportService {
  private platformId = inject(PLATFORM_ID);

  isMobile = signal(false);

  constructor() {
    if (!isPlatformBrowser(this.platformId)) return;
    const mql = window.matchMedia(MOBILE_QUERY);
    this.isMobile.set(mql.matches);
    mql.addEventListener('change', e => this.isMobile.set(e.matches));
  }
}
