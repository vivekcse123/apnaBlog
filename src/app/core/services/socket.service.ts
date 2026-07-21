import { Injectable, PLATFORM_ID, inject, effect } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Observable } from 'rxjs';
import { io, Socket } from 'socket.io-client';
import { environment } from '../../../environments/environment';
import { Auth } from './auth';

/**
 * Single shared Socket.IO connection for the whole app. Previously only
 * CallbackRequestService opened its own connection; now that notifications,
 * direct messages, and the admin Messages module all need live events in the
 * same browser tab, each opening its own io(...) would mean redundant
 * duplicate connections each authenticating separately. Consumers subscribe
 * via on() (or call ensureConnected() directly) - the socket connects lazily
 * on first use, so anonymous visitors on pages with no live-data consumer
 * never open one.
 */
@Injectable({ providedIn: 'root' })
export class SocketService {
  private auth = inject(Auth);
  private platformId = inject(PLATFORM_ID);

  private socket: Socket | null = null;
  private connectedToken: string | null = null;
  private hasConnectedOnce = false;

  constructor() {
    // Reconnect under the new identity whenever the auth token changes
    // (login/logout/session switch) - but only once a connection has
    // actually been requested, so this stays opt-in rather than opening a
    // socket for every visitor regardless of whether anything needs it.
    effect(() => {
      const token = this.auth.token();
      if (!isPlatformBrowser(this.platformId) || !this.hasConnectedOnce) return;
      if (token === this.connectedToken) return;
      this._connect(token);
    });
  }

  /** Idempotent - safe to call from every consumer. Connects lazily on first use. */
  ensureConnected(): void {
    if (!isPlatformBrowser(this.platformId) || this.socket) return;
    this._connect(this.auth.token());
  }

  /** Subscribe to a server-emitted event; connects the socket on first use. */
  on<T = unknown>(event: string): Observable<T> {
    this.ensureConnected();
    return new Observable<T>(subscriber => {
      const handler = (payload: T) => subscriber.next(payload);
      this.socket?.on(event, handler);
      return () => this.socket?.off(event, handler);
    });
  }

  private _connect(token: string | null): void {
    this.socket?.disconnect();
    const base = environment.apiUrl.replace(/\/api\/?$/, '');
    this.socket = io(base, { auth: { token: token ?? '' }, transports: ['websocket', 'polling'] });
    this.connectedToken = token;
    this.hasConnectedOnce = true;
  }
}
