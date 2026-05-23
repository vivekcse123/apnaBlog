import {
  Injectable, OnDestroy, inject, effect, PLATFORM_ID
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpClient, HttpParams } from '@angular/common/http';
import {
  BehaviorSubject, Observable,
  tap, catchError, of,
} from 'rxjs';
import { NotificationResponse, Notification } from '../../shared/models/notification.model';
import { Auth } from './auth';
import { environment } from '../../../environments/environment';

const POLL_INTERVAL_MS  = 60_000; // 1 minute
const VISIBILITY_TTL_MS = 5 * 60_000; // refresh if tab was hidden > 5 min

@Injectable({ providedIn: 'root' })
export class NotificationService implements OnDestroy {

  private readonly ADMIN_API = `${environment.apiUrl}/admin/notifications`;
  private readonly USER_API  = `${environment.apiUrl}/notifications`;

  private _notifications$ = new BehaviorSubject<Notification[]>([]);
  private _unreadCount$   = new BehaviorSubject<number>(0);
  private _loading$       = new BehaviorSubject<boolean>(false);
  private _initialized    = false;

  private _lastFetchAt       = 0;
  private _pollTimer: ReturnType<typeof setInterval> | undefined = undefined;
  private _visibilityHandler: (() => void) | undefined = undefined;

  notifications$ = this._notifications$.asObservable();
  unreadCount$   = this._unreadCount$.asObservable();
  loading$       = this._loading$.asObservable();

  private http        = inject(HttpClient);
  private authService = inject(Auth);
  private platformId  = inject(PLATFORM_ID);

  constructor() {
    effect(() => {
      const token = this.authService.token();
      const role  = this.authService.userRole();

      if (!isPlatformBrowser(this.platformId)) return;

      if (token && role) {
        if (!this._initialized) {
          this._initialized = true;
          this.fetchNotifications();
          this._startPolling();
          this._setupVisibilityRefresh();
        }
      } else {
        this._reset();
      }
    });
  }

  fetchNotifications(page = 1, limit = 20): void {
    this._loading$.next(true);
    const params = new HttpParams()
      .set('page',  page)
      .set('limit', limit);

    this.http
      .get<NotificationResponse>(this.api, { params })
      .pipe(catchError(() => of(null)))
      .subscribe(res => {
        if (res) {
          this._apply(res);
          this._lastFetchAt = Date.now();
        }
        this._loading$.next(false);
      });
  }

  markAsRead(id: string): Observable<void> {
    return this.http
      .patch<void>(`${this.api}/${id}/read`, {})
      .pipe(
        tap(() => this._markReadLocally(id)),
        catchError(() => of(void 0)),
      );
  }

  markAllAsRead(): Observable<void> {
    return this.http
      .patch<void>(`${this.api}/read-all`, {})
      .pipe(
        tap(() => {
          this._notifications$.next(
            this._notifications$.value.map(n => ({ ...n, isRead: true })),
          );
          this._unreadCount$.next(0);
        }),
        catchError(() => of(void 0)),
      );
  }

  deleteNotification(id: string): Observable<void> {
    return this.http
      .delete<void>(`${this.api}/${id}`)
      .pipe(
        tap(() => {
          const filtered = this._notifications$.value.filter(n => n.id !== id);
          this._notifications$.next(filtered);
          this._unreadCount$.next(filtered.filter(n => !n.isRead).length);
        }),
        catchError(() => of(void 0)),
      );
  }

  deleteAllNotifications(): Observable<void> {
    return this.http
      .delete<void>(this.api)
      .pipe(
        tap(() => {
          this._notifications$.next([]);
          this._unreadCount$.next(0);
        }),
        catchError(() => of(void 0)),
      );
  }

  ngOnDestroy(): void { this._reset(); }

  // ─── Private ──────────────────────────────────────────────

  private get api(): string {
    return this.authService.isAdmin() ? this.ADMIN_API : this.USER_API;
  }

  private _reset(): void {
    this._initialized = false;
    this._lastFetchAt = 0;
    this._stopPolling();
    this._removeVisibilityListener();
    this._notifications$.next([]);
    this._unreadCount$.next(0);
    this._loading$.next(false);
  }

  private _startPolling(): void {
    this._stopPolling();
    if (!isPlatformBrowser(this.platformId)) return;
    this._pollTimer = setInterval(() => {
      if (document.visibilityState === 'hidden') return;
      if (!this.authService.token()) return;
      this.fetchNotifications();
    }, POLL_INTERVAL_MS);
  }

  private _stopPolling(): void {
    if (this._pollTimer != null) {
      clearInterval(this._pollTimer);
      this._pollTimer = undefined;
    }
  }

  private _setupVisibilityRefresh(): void {
    if (this._visibilityHandler || !isPlatformBrowser(this.platformId)) return;
    this._visibilityHandler = () => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - this._lastFetchAt > VISIBILITY_TTL_MS) {
        this.fetchNotifications();
      }
    };
    document.addEventListener('visibilitychange', this._visibilityHandler);
  }

  private _removeVisibilityListener(): void {
    if (this._visibilityHandler && isPlatformBrowser(this.platformId)) {
      document.removeEventListener('visibilitychange', this._visibilityHandler);
      this._visibilityHandler = undefined;
    }
  }

  private _markReadLocally(id: string): void {
    const updated = this._notifications$.value.map(n =>
      n.id === id ? { ...n, isRead: true } : n,
    );
    this._notifications$.next(updated);
    this._unreadCount$.next(Math.max(0, this._unreadCount$.value - 1));
  }

  private _apply(res: NotificationResponse): void {
    const normalized = (res.notifications ?? []).map(n => ({
      ...n,
      id: n.id ?? (n as any)._id?.toString(),
    }));
    this._notifications$.next(normalized);
    this._unreadCount$.next(res.unreadCount ?? 0);
  }
}
