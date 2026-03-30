import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environments.prod';

@Injectable({
  providedIn: 'root'
})
export class VisitorService {

  private readonly API = `${environment.apiUrl}/visitor`;

  private readonly TRACKED_PAGES = [
    '/welcome/apna-blog',
    '/welcome/about'
  ];

  constructor(private http: HttpClient) {}

  private normalizePath(rawPath: string): string {
    let path = rawPath.split('?')[0].replace(/\/+$/, '') || '/';

    if (!path.startsWith('/')) {
      path = '/' + path;
    }

    return path;
  }

  private isTrackedPage(path: string): boolean {
    return this.TRACKED_PAGES.includes(path);
  }

  private isDuplicate(path: string): boolean {
    const lastTracked = sessionStorage.getItem('lastTrackedPage');
    if (lastTracked === path) return true;

    sessionStorage.setItem('lastTrackedPage', path);
    return false;
  }

  trackVisit(rawPath: string): void {
    const path = this.normalizePath(rawPath);

    console.log('[VisitorService] Path:', path);

    if (!this.isTrackedPage(path)) {
      console.log('[VisitorService] Not tracked page:', path);
      return;
    }

    if (this.isDuplicate(path)) {
      console.log('[VisitorService] Duplicate skipped:', path);
      return;
    }

    this.http.post(`${this.API}/track`, { page: path }).subscribe({
      next: () => console.log('[VisitorService] Tracked:', path),
      error: (err) => console.warn('[VisitorService] Tracking failed:', err?.message || err)
    });
  }
}