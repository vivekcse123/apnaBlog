import {
  Component, OnInit, OnDestroy, HostListener,
  ElementRef, inject, ChangeDetectionStrategy, signal
} from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { Router } from '@angular/router';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { filter, Subject, takeUntil } from 'rxjs';

import {
  Notification, NotificationType, NOTIFICATION_META,
} from '../../models/notification.model';
import { NotificationService } from '../../../core/services/notification-service';
import { NotificationNavigationService, NON_NAVIGABLE_TYPES} from '../../../core/services/open-notification/notification-navigation';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-notification-panel',
  standalone: true,
  imports: [CommonModule, MatProgressSpinnerModule, MatIconModule],
  templateUrl: './notification-panel.html',
  styleUrls: ['./notification-panel.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotificationPanel implements OnInit, OnDestroy {

  private svc      = inject(NotificationService);
  private navSvc   = inject(NotificationNavigationService);
  private elRef    = inject(ElementRef);
  private destroy$ = new Subject<void>();

  notifications = signal<Notification[]>([]);
  unreadCount   = signal(0);
  loading       = signal(false);
  panelOpen     = signal(false);
  refreshing    = signal(false);
  clearingAll   = signal(false);

  readonly meta = NOTIFICATION_META;

  ngOnInit(): void {
    this.svc.notifications$
      .pipe(takeUntil(this.destroy$))
      .subscribe(n => this.notifications.set(n || []));

    this.svc.unreadCount$
      .pipe(takeUntil(this.destroy$))
      .subscribe(c => this.unreadCount.set(c));

    this.svc.loading$
      .pipe(takeUntil(this.destroy$))
      .subscribe(l => this.loading.set(l));
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  getMeta(type: NotificationType) {
    return this.meta[type] ?? { icon: 'notifications', color: '#999', label: 'Unknown' };
  }

  isNavigable(type: NotificationType): boolean {
    return !NON_NAVIGABLE_TYPES.includes(type);
  }

  togglePanel(event: Event): void {
    event.stopPropagation();
    this.panelOpen.update(v => !v);
  }

  @HostListener('document:click', ['$event'])
  onOutsideClick(event: MouseEvent): void {
    if (!this.elRef.nativeElement.contains(event.target)) {
      this.panelOpen.set(false);
    }
  }

  onNotificationClick(notification: Notification): void {
  if (!notification?.id) return;

  if (!notification.isRead) {
    this.svc.markAsRead(notification.id).subscribe();
  }

<<<<<<< HEAD
  if (this.isNavigable(notification.type) && notification.resourceId) {
    // ✅ Pass resourceUrl so user notifications navigate to /blog/:id directly
    this.navSvc.navigateTo(
      {
=======
    if (this.isNavigable(notification.type) && notification.resourceId) {
      this.navSvc.navigateTo({
>>>>>>> dev
        type:       notification.type,
        resourceId: notification.resourceId,
        metadata:   notification.metadata ?? {},
      },
      notification.resourceUrl   // ← new second argument
    );
    this.panelOpen.set(false);
  }
}

  onMarkAllRead(event: Event): void {
    event.stopPropagation();
    this.svc.markAllAsRead().subscribe();
  }

  onDelete(event: Event, id?: string): void {
    event.stopPropagation();
    if (!id) return;
    this.svc.deleteNotification(id).subscribe();
  }

<<<<<<< HEAD
// refreshing = signal(false);

onRefresh(event: Event): void {
  event.stopPropagation();
  event.preventDefault();
  this.refreshing.set(true);
  this.svc.fetchNotifications();
  this.svc.loading$
    .pipe(
      filter(l => !l),
      takeUntil(this.destroy$)
    )
    .subscribe(() => this.refreshing.set(false));
}
}
=======
  onClearAll(event: Event): void {
    event.stopPropagation();
    if (this.clearingAll() || this.notifications().length === 0) return;

    this.clearingAll.set(true);
    this.svc.deleteAllNotifications().subscribe({
      complete: () => this.clearingAll.set(false),
      error:    () => this.clearingAll.set(false),
    });
  }

  onRefresh(event: Event): void {
    event.stopPropagation();
    event.preventDefault();
    if (this.refreshing()) return;

    this.refreshing.set(true);
    this.svc.fetchNotifications();

    this.svc.loading$
      .pipe(filter(l => !l), take(1), takeUntil(this.destroy$))
      .subscribe(() => this.refreshing.set(false));
  }

  /** Human-readable relative time: "just now", "5m ago", "3h ago", "yesterday", etc. */
  timeAgo(date: string | Date | undefined): string {
    if (!date) return '';
    const diff = Math.floor((Date.now() - new Date(date).getTime()) / 1000);

    if (diff <  60)       return 'just now';
    if (diff <  3_600)    return `${Math.floor(diff / 60)}m ago`;
    if (diff <  86_400)   return `${Math.floor(diff / 3_600)}h ago`;
    if (diff <  172_800)  return 'yesterday';
    if (diff <  604_800)  return `${Math.floor(diff / 86_400)}d ago`;

    return new Date(date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
  }
}
>>>>>>> dev
