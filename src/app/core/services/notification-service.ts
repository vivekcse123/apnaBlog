import { Injectable, OnDestroy } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import {
  BehaviorSubject,
  Observable,
  Subscription,
  interval,
  switchMap,
  tap,
  catchError,
  of,
  filter,
} from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  NotificationResponse,
  Notification
} from '../../shared/models/notification.model';

@Injectable({ providedIn: 'root' })
export class NotificationService implements OnDestroy {

  private readonly API = `${environment.apiUrl}/admin/notifications`;
  private readonly POLL_INTERVAL_MS = 30_000;

  private _notifications$ = new BehaviorSubject<Notification[]>([]);
  private _unreadCount$   = new BehaviorSubject<number>(0);
  private _loading$       = new BehaviorSubject<boolean>(false);

  notifications$  = this._notifications$.asObservable();
  unreadCount$    = this._unreadCount$.asObservable();
  loading$        = this._loading$.asObservable();

  private pollSub?: Subscription;

  constructor(private http: HttpClient) {}

  // ✅ START POLLING (SAFE)
  startPolling(): void {
    if (this.pollSub) return; // 🚫 prevent duplicate polling

    this.fetchNotifications();

    this.pollSub = interval(this.POLL_INTERVAL_MS)
      .pipe(
        switchMap(() => this._fetch()),
        filter((res): res is NotificationResponse => !!res) // ✅ removes null
      )
      .subscribe(res => this._apply(res));
  }

  // ✅ STOP POLLING (CLEAN)
  stopPolling(): void {
    this.pollSub?.unsubscribe();
    this.pollSub = undefined; // ✅ reset
  }

  // ✅ FETCH WITH LOADING + SAFETY
  fetchNotifications(page = 1, limit = 20): void {
    this._loading$.next(true);

    const params = new HttpParams()
      .set('page', page)
      .set('limit', limit);

    this.http
      .get<NotificationResponse>(this.API, { params })
      .pipe(
        catchError(err => {
          console.error('Fetch notifications failed:', err);
          return of(null);
        })
      )
      .subscribe(res => {
        if (res) this._apply(res);
        this._loading$.next(false);
      });
  }

  // ✅ MARK AS READ
  markAsRead(notificationId: string): Observable<void> {
    return this.http
      .patch<void>(`${this.API}/${notificationId}/read`, {})
      .pipe(
        tap(() => {
          const updated = this._notifications$.value.map(n =>
            n.id === notificationId ? { ...n, isRead: true } : n
          );
          this._notifications$.next(updated);

          this._unreadCount$.next(
            Math.max(0, this._unreadCount$.value - 1)
          );
        })
      );
  }

  // ✅ MARK ALL
  markAllAsRead(): Observable<void> {
    return this.http
      .patch<void>(`${this.API}/read-all`, {})
      .pipe(
        tap(() => {
          const updated = this._notifications$.value.map(n => ({
            ...n,
            isRead: true,
          }));

          this._notifications$.next(updated);
          this._unreadCount$.next(0);
        })
      );
  }

  // ✅ DELETE
  deleteNotification(notificationId: string): Observable<void> {
    return this.http
      .delete<void>(`${this.API}/${notificationId}`)
      .pipe(
        tap(() => {
          const filtered = this._notifications$.value.filter(
            n => n.id !== notificationId
          );

          this._notifications$.next(filtered);
          this._unreadCount$.next(
            filtered.filter(n => !n.isRead).length
          );
        })
      );
  }

  // ✅ SAFE FETCH (NEVER CRASH)
  private _fetch(): Observable<NotificationResponse | null> {
    return this.http.get<NotificationResponse>(this.API).pipe(
      catchError(err => {
        console.error('Polling failed:', err);
        return of(null);
      })
    );
  }

  // ✅ SAFE APPLY (CRITICAL FIX)
  private _apply(res: NotificationResponse): void {
    this._notifications$.next(res.notifications ?? []);
    this._unreadCount$.next(res.unreadCount ?? 0);
  }

  ngOnDestroy(): void {
    this.stopPolling();
  }
}