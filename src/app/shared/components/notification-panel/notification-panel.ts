import {
  Component,
  OnInit,
  OnDestroy,
  HostListener,
  ElementRef,
  inject,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Subject, takeUntil } from 'rxjs';

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

  notifications: Notification[] = [];
  unreadCount = 0;
  loading = false;
  panelOpen = false;

  readonly meta = NOTIFICATION_META;

  // ✅ INIT
  ngOnInit(): void {
    this.svc.notifications$
      .pipe(takeUntil(this.destroy$))
      .subscribe((n: Notification[]) => {
        this.notifications = n || []; // ✅ FIX (no push)
      });

    this.svc.unreadCount$
      .pipe(takeUntil(this.destroy$))
      .subscribe(c => (this.unreadCount = c));

    this.svc.loading$
      .pipe(takeUntil(this.destroy$))
      .subscribe(l => (this.loading = l));
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ✅ SAFE META ACCESS
  getMeta(type: NotificationType) {
    return this.meta[type] ?? {
      icon: 'notifications',
      color: '#999',
      label: 'Unknown',
    };
  }

  // ✅ PANEL TOGGLE
  togglePanel(event: Event): void {
    event.stopPropagation();
    this.panelOpen = !this.panelOpen;
  }

  @HostListener('document:click', ['$event'])
  onOutsideClick(event: MouseEvent): void {
    if (!this.elRef.nativeElement.contains(event.target)) {
      this.panelOpen = false;
    }
  }

  // ✅ CLICK HANDLER (SAFE ID)
  onNotificationClick(notification: Notification): void {
    if (!notification?.id) return;

    if (!notification.isRead) {
      this.svc.markAsRead(notification.id).subscribe();
    }

    if (notification.resourceUrl) {
      this.router.navigateByUrl(notification.resourceUrl);
    }

    this.panelOpen = false;
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
    this.svc.fetchNotifications();
  }

  // ✅ FIX TRACKBY (NO DUPLICATES)
  trackById(index: number, n: Notification): string {
    return n.id || index.toString();
  }
}