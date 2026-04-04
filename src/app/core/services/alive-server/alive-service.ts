import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environments.prod';

@Injectable({ providedIn: 'root' })
export class AliveService {
  private http = inject(HttpClient);
  private pingUrl = `${environment.apiUrl}/health`; 
  private intervalId: ReturnType<typeof setInterval> | null = null;

  start(): void {
    this.intervalId = setInterval(() => this.ping(), 10 * 60 * 1000);
  }

  stop(): void {
    if (this.intervalId) clearInterval(this.intervalId);
  }

  private ping(): void {
    this.http.get(this.pingUrl, { responseType: 'text' })
      .subscribe({ error: () => {} });
  }
}