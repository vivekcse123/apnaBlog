import {
  Injectable, OnDestroy, inject, effect, PLATFORM_ID
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpClient, HttpParams } from '@angular/common/http';
import {
  BehaviorSubject, Observable,
  tap, catchError, of, forkJoin, map,
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
  private _sourceMap = new Map<string, 'admin' | 'user'>();

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

    if (this.authService.isAdmin()) {
      // Admins receive both site-moderation alerts and their own personal
      // notifications (e.g. someone messaged them as an author), which live
      // on two separate endpoints — merge both into one feed.
      forkJoin({
        admin: this.http.get<NotificationResponse>(this.ADMIN_API, { params }).pipe(catchError(() => of(null))),
        user:  this.http.get<NotificationResponse>(this.USER_API,  { params }).pipe(catchError(() => of(null))),
      }).subscribe(({ admin, user }) => {
        this._applyMerged(admin, user);
        this._lastFetchAt = Date.now();
        this._loading$.next(false);
      });
    } else {
      this.http
        .get<NotificationResponse>(this.USER_API, { params })
        .pipe(catchError(() => of(null)))
        .subscribe(res => {
          if (res) {
            this._apply(res);
            this._lastFetchAt = Date.now();
          }
          this._loading$.next(false);
        });
    }
  }

  markAsRead(id: string): Observable<void> {
    return this.http
      .patch<void>(`${this._apiFor(id)}/${id}/read`, {})
      .pipe(
        tap(() => this._markReadLocally(id)),
        catchError(() => of(void 0)),
      );
  }

  markAllAsRead(): Observable<void> {
    const request$ = this.authService.isAdmin()
      ? forkJoin([
          this.http.patch<void>(`${this.ADMIN_API}/read-all`, {}).pipe(catchError(() => of(void 0))),
          this.http.patch<void>(`${this.USER_API}/read-all`,  {}).pipe(catchError(() => of(void 0))),
        ]).pipe(map(() => void 0))
      : this.http.patch<void>(`${this.USER_API}/read-all`, {}).pipe(catchError(() => of(void 0)));

    return request$.pipe(
      tap(() => {
        this._notifications$.next(
          this._notifications$.value.map(n => ({ ...n, isRead: true })),
        );
        this._unreadCount$.next(0);
      }),
    );
  }

  deleteNotification(id: string): Observable<void> {
    return this.http
      .delete<void>(`${this._apiFor(id)}/${id}`)
      .pipe(
        tap(() => {
          const filtered = this._notifications$.value.filter(n => n.id !== id);
          this._notifications$.next(filtered);
          this._unreadCount$.next(filtered.filter(n => !n.isRead).length);
          this._sourceMap.delete(id);
        }),
        catchError(() => of(void 0)),
      );
  }

  deleteAllNotifications(): Observable<void> {
    const request$ = this.authService.isAdmin()
      ? forkJoin([
          this.http.delete<void>(this.ADMIN_API).pipe(catchError(() => of(void 0))),
          this.http.delete<void>(this.USER_API).pipe(catchError(() => of(void 0))),
        ]).pipe(map(() => void 0))
      : this.http.delete<void>(this.USER_API).pipe(catchError(() => of(void 0)));

    return request$.pipe(
      tap(() => {
        this._notifications$.next([]);
        this._unreadCount$.next(0);
        this._sourceMap.clear();
      }),
    );
  }

  ngOnDestroy(): void { this._reset(); }

  // ─── Private ──────────────────────────────────────────────

  private _apiFor(id: string): string {
    return this._sourceMap.get(id) === 'admin' ? this.ADMIN_API : this.USER_API;
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
    const normalized = (res.notifications ?? []).map(n => this._normalize(n, 'user'));
    this._notifications$.next(normalized);
    this._unreadCount$.next(res.unreadCount ?? 0);
  }

  private _applyMerged(admin: NotificationResponse | null, user: NotificationResponse | null): void {
    const adminList = (admin?.notifications ?? []).map(n => this._normalize(n, 'admin'));
    const userList  = (user?.notifications ?? []).map(n => this._normalize(n, 'user'));

    const merged = [...adminList, ...userList]
      .filter((n, i, arr) => arr.findIndex(x => x.id === n.id) === i)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    this._notifications$.next(merged);
    this._unreadCount$.next((admin?.unreadCount ?? 0) + (user?.unreadCount ?? 0));
  }

  private _normalize(n: Notification, source: 'admin' | 'user'): Notification {
    const id = n.id ?? (n as any)._id?.toString();
    this._sourceMap.set(id, source);
    return { ...n, id };
  }
}
