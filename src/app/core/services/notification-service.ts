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
} from 'rxjs';
import { environment } from '../../../environments/environment';
import { NotificationResponse, Notification } from '../../shared/models/notification.model';

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

  startPolling(): void {
    this.fetchNotifications();                 
    this.pollSub = interval(this.POLL_INTERVAL_MS)
    .pipe(switchMap(() => this._fetch()))
    .subscribe((res: any) => this._apply(res));
  }

  stopPolling(): void {
    this.pollSub?.unsubscribe();
  }

  fetchNotifications(page = 1, limit = 20): void {
    this._loading$.next(true);
    const params = new HttpParams()
      .set('page', page)
      .set('limit', limit);

    this.http
      .get<NotificationResponse>(this.API, { params })
      .pipe(catchError(() => of(null)))
      .subscribe(res => {
        if (res) this._apply(res);
        this._loading$.next(false);
      });
  }

  markAsRead(notificationId: string): Observable<void> {
    return this.http
      .patch<void>(`${this.API}/${notificationId}/read`, {})
      .pipe(
        tap(() => {
          const updated = this._notifications$.value.map(n =>
            n.id === notificationId ? { ...n, isRead: true } : n
          );
          this._notifications$.next(updated);
          this._unreadCount$.next(Math.max(0, this._unreadCount$.value - 1));
        })
      );
  }

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

  deleteNotification(notificationId: string): Observable<void> {
    return this.http
      .delete<void>(`${this.API}/${notificationId}`)
      .pipe(
        tap(() => {
          const filtered = this._notifications$.value.filter(
            n => n.id !== notificationId
          );
          this._notifications$.next(filtered);

          this._unreadCount$.next(filtered.filter(n => !n.isRead).length);
        })
      );
  }

  private _fetch(): Observable<NotificationResponse | null> {
    return this.http
      .get<NotificationResponse>(this.API)
      .pipe(catchError(() => of(null)));
  }

  private _apply(res: NotificationResponse): void {
    this._notifications$.next(res.notifications);
    this._unreadCount$.next(res.unreadCount);
  }

  ngOnDestroy(): void {
    this.stopPolling();
  }
}