import { Injectable, inject, PLATFORM_ID, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class PushNotificationService {
  private http       = inject(HttpClient);
  private platformId = inject(PLATFORM_ID);
  private api        = `${environment.apiUrl}/push`;

  permission   = signal<NotificationPermission>('default');
  subscribed   = signal(false);
  loading      = signal(false);

  private sw: ServiceWorkerRegistration | null = null;

  async init(): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return;
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;

    this.permission.set(Notification.permission);

    try {
      this.sw = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      const existing = await this.sw.pushManager.getSubscription();
      this.subscribed.set(!!existing);
    } catch (err) {
    }
  }

  get isSupported(): boolean {
    if (!isPlatformBrowser(this.platformId)) return false;
    return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  }

  async requestAndSubscribe(): Promise<void> {
    if (!this.isSupported || this.loading()) return;
    this.loading.set(true);
    try {
      const perm = await Notification.requestPermission();
      this.permission.set(perm);
      if (perm !== 'granted') { this.loading.set(false); return; }

      if (!this.sw) {
        this.sw = await navigator.serviceWorker.ready;
      }

      // Get VAPID public key from backend
      const { publicKey } = await this.http
        .get<{ status: number; publicKey: string }>(`${this.api}/vapid-public-key`)
        .toPromise() as { status: number; publicKey: string };

      const sub = await this.sw.pushManager.subscribe({
        userVisibleOnly:      true,
        applicationServerKey: this.urlBase64ToUint8Array(publicKey),
      });

      await this.http.post(`${this.api}/subscribe`, sub.toJSON()).toPromise();
      this.subscribed.set(true);
    } catch (err) {
    } finally {
      this.loading.set(false);
    }
  }

  async unsubscribe(): Promise<void> {
    if (!this.sw) return;
    this.loading.set(true);
    try {
      const sub = await this.sw.pushManager.getSubscription();
      if (sub) {
        await this.http.delete(`${this.api}/unsubscribe`, { body: { endpoint: sub.endpoint } }).toPromise();
        await sub.unsubscribe();
      }
      this.subscribed.set(false);
    } catch (err) {
    } finally {
      this.loading.set(false);
    }
  }

  private urlBase64ToUint8Array(base64String: string): ArrayBuffer {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    // Use Buffer on Node/SSR, window.atob in browser
    const raw = isPlatformBrowser(this.platformId)
      ? window.atob(base64)
      : Buffer.from(base64, 'base64').toString('binary');
    const arr = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
    return arr.buffer as ArrayBuffer;
  }
}
