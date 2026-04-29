import { Injectable, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environments.prod';

@Injectable({
  providedIn: 'root'
})
export class VisitorService {

  private readonly API = `${environment.apiUrl}/visitor`;
  private platformId   = inject(PLATFORM_ID);

  private readonly TRACKED_PAGES = [
    '/',
    '/welcome',      // home page route
    '/about',
    '/privacy-policy',
    '/terms',
    '/disclaimer',
  ];

  constructor(private http: HttpClient) {}

  private normalizePath(rawPath: string): string {
    let path = rawPath.split('?')[0].replace(/\/+$/, '') || '/';
    if (!path.startsWith('/')) path = '/' + path;
    return path;
  }

  private isTrackedPage(path: string): boolean {
    return this.TRACKED_PAGES.includes(path);
  }

  private hasConsent(): boolean {
    try {
      return localStorage.getItem('apna_cookie_consent') === 'accepted';
    } catch { return false; }
  }

  private isDuplicate(path: string): boolean {
    try {
      const lastTracked = sessionStorage.getItem('lastTrackedPage');
      if (lastTracked === path) return true;
      sessionStorage.setItem('lastTrackedPage', path);
    } catch { return false; }
    return false;
  }

  trackVisit(rawPath: string): void {
    if (!isPlatformBrowser(this.platformId)) return;

    // Only track when the user has explicitly accepted cookies
    if (!this.hasConsent()) return;

    const path = this.normalizePath(rawPath);

    if (!this.isTrackedPage(path)) return;
    if (this.isDuplicate(path)) return;

    this.http.post(`${this.API}/track`, { page: path }).subscribe({ error: () => {} });
  }
}