import { Injectable, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environments.prod';

@Injectable({ providedIn: 'root' })
export class AliveService {
  private http       = inject(HttpClient);
  private platformId = inject(PLATFORM_ID);
  private pingUrl    = `${environment.apiUrl}/health`;
  private intervalId: ReturnType<typeof setInterval> | null = null;

  start(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    this.intervalId = setInterval(() => this.ping(), 10 * 60 * 1000);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  private ping(): void {
    // Skip pings when the browser tab is in the background
    if (document.visibilityState !== 'visible') return;
    this.http.get(this.pingUrl, { responseType: 'text' })
      .subscribe({ error: () => {} });
  }
}