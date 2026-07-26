import { Injectable, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class VisitorService {

  private readonly API = `${environment.apiUrl}/visitor`;
  private platformId   = inject(PLATFORM_ID);

  constructor(private http: HttpClient) {}

  /**
   * Returns false only when the user has explicitly clicked "Decline".
   * Anonymous page-count analytics (no personal profile built) are
   * considered essential and do not require opt-in consent.
   */
  private hasConsent(): boolean {
    try {
      return localStorage.getItem('apna_cookie_consent') !== 'declined';
    } catch { return true; }
  }

  /**
   * Per-session deduplication - prevents double-counting on hot-reload
   * or rapid back/forward navigation to the same path.
   */
  private isDuplicate(path: string): boolean {
    try {
      const last = sessionStorage.getItem('lastTrackedPage');
      if (last === path) return true;
      sessionStorage.setItem('lastTrackedPage', path);
    } catch { return false; }
    return false;
  }

  private normalizePath(rawPath: string): string {
    let path = rawPath.split('?')[0].replace(/\/+$/, '') || '/';
    if (!path.startsWith('/')) path = '/' + path;
    return path;
  }

  trackVisit(rawPath: string): void {
    if (!isPlatformBrowser(this.platformId)) return;
    if (!this.hasConsent()) return;

    const path = this.normalizePath(rawPath);
    if (this.isDuplicate(path)) return;

    this.http.post(`${this.API}/track`, { page: path }).subscribe({ error: () => {} });
  }

  /**
   * Reports a completed PWA install (fires once per device via a
   * localStorage flag - the `appinstalled` event can otherwise fire
   * more than once, e.g. across reinstalls or duplicate listeners).
   */
  recordPwaInstall(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    if (!this.hasConsent()) return;

    try {
      if (localStorage.getItem('apna_pwa_install_reported') === '1') return;
      localStorage.setItem('apna_pwa_install_reported', '1');
    } catch { /* if storage is unavailable, fall through and report anyway */ }

    this.http.post(`${this.API}/pwa-install`, {}).subscribe({ error: () => {} });
  }
}
