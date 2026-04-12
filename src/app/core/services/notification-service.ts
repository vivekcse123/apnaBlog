import {
  Injectable, OnDestroy, inject, effect, PLATFORM_ID
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpClient, HttpParams } from '@angular/common/http';
import {
  BehaviorSubject, Observable, Subscription,
  interval, switchMap, tap, catchError, of, filter, fromEvent,
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
  private visibilitySub?: Subscription;

  private http        = inject(HttpClient);
  private authService = inject(Auth);
  private platformId  = inject(PLATFORM_ID);

  constructor() {
    effect(() => {
      const token = this.authService.token();
      const role  = this.authService.userRole();

      if (!isPlatformBrowser(this.platformId)) return;

      if (token && role) {
        this._reset();
        this._startPolling();
      } else {
        this._reset();
      }
    });
  }

  startPolling(): void {}

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

  deleteAllNotifications(): Observable<void> {
    return this.http
      .delete<void>(this.api)
      .pipe(
        tap(() => {
          this._notifications$.next([]);
          this._unreadCount$.next(0);
        }),
        catchError(err => {
          console.error('Delete all notifications error:', err);
          return of(void 0);
        }),
      );
  }

  ngOnDestroy(): void {
    this._reset();
    this.visibilitySub?.unsubscribe();
  }

  private get api(): string {
    return this.authService.isAdmin() ? this.ADMIN_API : this.USER_API;
  }

  private _reset(): void {
    this.pollSub?.unsubscribe();
    this.pollSub = undefined;
    this._notifications$.next([]);
    this._unreadCount$.next(0);
    this._loading$.next(false);
  }

  private _startPolling(): void {
    this.fetchNotifications();

    this.pollSub = interval(this.POLL_MS)
      .pipe(
        // Skip the network call when the tab is hidden — saves bandwidth and
        // reduces server load for background tabs.
        filter(() => !isPlatformBrowser(this.platformId) || document.visibilityState === 'visible'),
        switchMap(() => this._fetch()),
        filter((res): res is NotificationResponse => !!res),
      )
      .subscribe(res => this._apply(res));

    // When the user returns to the tab after it was hidden, fetch immediately
    // instead of waiting for the next poll interval.
    if (isPlatformBrowser(this.platformId)) {
      this.visibilitySub?.unsubscribe();
      this.visibilitySub = fromEvent(document, 'visibilitychange')
        .pipe(filter(() => document.visibilityState === 'visible'))
        .subscribe(() => this.fetchNotifications());
    }
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
    const normalized = (res.notifications ?? []).map(n => ({
      ...n,
      id: n.id ?? (n as any)._id?.toString(),
    }));
    this._notifications$.next(normalized);
    this._unreadCount$.next(res.unreadCount ?? 0);
  }
}