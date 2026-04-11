import {
  Component, OnInit, OnDestroy, HostListener,
  ElementRef, inject, ChangeDetectionStrategy, signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
import { filter, Subject, take, takeUntil } from 'rxjs';

import {
  Notification, NotificationType, NOTIFICATION_META,
} from '../../models/notification.model';
import { NotificationService } from '../../../core/services/notification-service';
import { NotificationNavigationService, NON_NAVIGABLE_TYPES} from '../../../core/services/open-notification/notification-navigation';

@Component({
  selector: 'app-notification-panel',
  standalone: true,
  imports: [CommonModule, MatProgressSpinnerModule, MatIconModule],
  templateUrl: './notification-panel.html',
  styleUrls: ['./notification-panel.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotificationPanel implements OnInit, OnDestroy {

  private svc     = inject(NotificationService);
  private navSvc  = inject(NotificationNavigationService);
  private elRef   = inject(ElementRef);
  private destroy$ = new Subject<void>();

  notifications = signal<Notification[]>([]);
  unreadCount   = signal(0);
  loading       = signal(false);
  panelOpen     = signal(false);
  refreshing    = signal(false);

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

    if (this.isNavigable(notification.type) && notification.resourceId) {
      // ✅ Navigate to correct route and store pending event for modal
      this.navSvc.navigateTo({
        type:       notification.type,
        resourceId: notification.resourceId,
        metadata:   notification.metadata ?? {},
      });
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
}