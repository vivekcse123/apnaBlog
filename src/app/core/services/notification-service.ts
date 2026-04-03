import {
  Injectable, OnDestroy, inject, effect, PLATFORM_ID
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpClient, HttpParams } from '@angular/common/http';
import {
  BehaviorSubject, Observable, Subscription,
  interval, switchMap, tap, catchError, of, filter,
} from 'rxjs';
import { NotificationResponse, Notification } from '../../shared/models/notification.model';
import { Auth } from './auth';
import { environment } from '../../../environments/environments.prod';

@Injectable({ providedIn: 'root' })
export class NotificationService implements OnDestroy {

  private readonly ADMIN_API = `${environment.apiUrl}/admin/notifications`;
  private readonly USER_API  = `${environment.apiUrl}/notifications`;
  private readonly POLL_MS   = 30_000;

  private _notifications$ = new BehaviorSubject<Notification[]>([]);
  private _unreadCount$   = new BehaviorSubject<number>(0);
  private _loading$       = new BehaviorSubject<boolean>(false);

  notifications$ = this._notifications$.asObservable();
  unreadCount$   = this._unreadCount$.asObservable();
  loading$       = this._loading$.asObservable();

  private pollSub?: Subscription;

  private http        = inject(HttpClient);
  private authService = inject(Auth);
  private platformId  = inject(PLATFORM_ID);

  constructor() {
    // ✅ React to EVERY auth state change (login, logout, role switch)
    // effect() re-runs automatically whenever token() or userRole() signal changes
    effect(() => {
      const token = this.authService.token();   // reactive read
      const role  = this.authService.userRole(); // reactive read — also resets on role switch

      if (!isPlatformBrowser(this.platformId)) return;

      if (token && role) {
        // Logged in (or role changed): clear stale data and restart with correct API
        this._reset();
        this._startPolling();
      } else {
        // Logged out: clear everything and stop polling
        this._reset();
      }
    });
  }

  // ── Public API ────────────────────────────────────────────────────────────────

  /** Call this from a component if you want to manually trigger a fresh fetch */
  fetchNotifications(page = 1, limit = 20): void {
    this._loading$.next(true);

    const params = new HttpParams()
      .set('page',  page)
      .set('limit', limit);

    this.http
      .get<NotificationResponse>(this.api, { params })
      .pipe(catchError(err => {
        console.error('Notification fetch error:', err);
        return of(null);
      }))
      .subscribe(res => {
        if (res) this._apply(res);
        this._loading$.next(false);
      });
  }

  // ── Mark as read ──────────────────────────────────────────────────────────────

  markAsRead(id: string): Observable<void> {
    return this.http
      .patch<void>(`${this.api}/${id}/read`, {})
      .pipe(
        tap(() => {
          const updated = this._notifications$.value.map(n =>
            n.id === id ? { ...n, isRead: true } : n,
          );
          this._notifications$.next(updated);
          this._unreadCount$.next(Math.max(0, this._unreadCount$.value - 1));
        }),
        catchError(err => {
          console.error('Mark as read error:', err);
          return of(void 0);
        }),
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
        catchError(err => {
          console.error('Mark all as read error:', err);
          return of(void 0);
        }),
      );
  }

  // ── Delete ────────────────────────────────────────────────────────────────────

  deleteNotification(id: string): Observable<void> {
    return this.http
      .delete<void>(`${this.api}/${id}`)
      .pipe(
        tap(() => {
          const filtered = this._notifications$.value.filter(n => n.id !== id);
          this._notifications$.next(filtered);
          this._unreadCount$.next(filtered.filter(n => !n.isRead).length);
        }),
        catchError(err => {
          console.error('Delete notification error:', err);
          return of(void 0);
        }),
      );
  }

  ngOnDestroy(): void {
    this._reset();
  }

  // ── Private ───────────────────────────────────────────────────────────────────

  private get api(): string {
    return this.authService.isAdmin() ? this.ADMIN_API : this.USER_API;
  }

  /** Stop polling + clear all state — called on logout and before every restart */
  private _reset(): void {
    this.pollSub?.unsubscribe();
    this.pollSub = undefined;

    // ✅ Immediately clear stale data so old role's notifications don't linger
    this._notifications$.next([]);
    this._unreadCount$.next(0);
    this._loading$.next(false);
  }

  /** Start polling fresh — always call _reset() before this */
  private _startPolling(): void {
    this.fetchNotifications();   // immediate first fetch

    this.pollSub = interval(this.POLL_MS)
      .pipe(
        switchMap(() => this._fetch()),
        filter((res): res is NotificationResponse => !!res),
      )
      .subscribe(res => this._apply(res));
  }

  private _fetch(): Observable<NotificationResponse | null> {
    return this.http.get<NotificationResponse>(this.api).pipe(
      catchError(err => {
        console.error('Poll failed:', err);
        return of(null);
      }),
    );
  }

  private _apply(res: NotificationResponse): void {
    this._notifications$.next(res.notifications ?? []);
    this._unreadCount$.next(res.unreadCount    ?? 0);
  }
}