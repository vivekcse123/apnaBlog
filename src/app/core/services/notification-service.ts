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

  private _notifications$ = new BehaviorSubject<Notification[]>([]);
  private _unreadCount$   = new BehaviorSubject<number>(0);
  private _loading$       = new BehaviorSubject<boolean>(false);
  private _initialized    = false; // ✅ guard: don't re-fetch if already loaded

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
        // ✅ Only fetch once per login session
        if (!this._initialized) {
          this._initialized = true;
          this.fetchNotifications();
        }
      } else {
        this._reset(); // logout → clear everything
      }
    });
  }

  // ✅ Manual refresh (called by refresh button only)
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

  // ✅ Local state mutation — no HTTP call
  markAsRead(id: string): Observable<void> {
    return this.http
      .patch<void>(`${this.api}/${id}/read`, {})
      .pipe(
        tap(() => this._markReadLocally(id)),
        catchError(err => {
          console.error('Mark as read error:', err);
          return of(void 0);
        }),
      );
  }

  // ✅ Local state mutation — no HTTP call
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
          console.error('Mark all read error:', err);
          return of(void 0);
        }),
      );
  }

  // ✅ Local state mutation — no HTTP call
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
          console.error('Delete error:', err);
          return of(void 0);
        }),
      );
  }

  ngOnDestroy(): void { this._reset(); }

  // ─── Private ──────────────────────────────────────────────

  private get api(): string {
    return this.authService.isAdmin() ? this.ADMIN_API : this.USER_API;
  }

  private _reset(): void {
    this._initialized = false; // ✅ allow re-fetch on next login
    this._notifications$.next([]);
    this._unreadCount$.next(0);
    this._loading$.next(false);
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