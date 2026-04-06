import {
  Component,
  OnInit,
  OnDestroy,
  HostListener,
  ElementRef,
  inject,
  ChangeDetectionStrategy,
  signal
} from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { filter, Subject, takeUntil } from 'rxjs';

import {
  Notification,
  NotificationType,
  NOTIFICATION_META,
} from '../../models/notification.model';
import { NotificationService } from '../../../core/services/notification-service';

@Component({
  selector: 'app-notification-panel',
  standalone: true,
  imports: [CommonModule, MatIconModule, MatProgressSpinnerModule, DatePipe],
  templateUrl: './notification-panel.html',
  styleUrls: ['./notification-panel.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotificationPanel implements OnInit, OnDestroy {

  private svc = inject(NotificationService);
  private router = inject(Router);
  private elRef = inject(ElementRef);
  private destroy$ = new Subject<void>();

  // ✅ SIGNALS
  notifications = signal<Notification[]>([]);
  unreadCount = signal(0);
  loading = signal(false);
  panelOpen = signal(false);

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
    return this.meta[type] ?? {
      icon: 'notifications',
      color: '#999',
      label: 'Unknown',
    };
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

    if (notification.resourceUrl) {
      this.router.navigateByUrl(notification.resourceUrl);
    }

    this.panelOpen.set(false);
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

refreshing = signal(false);

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