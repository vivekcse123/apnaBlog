import { Injectable, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environments.prod';

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
   * Per-session deduplication — prevents double-counting on hot-reload
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
}
