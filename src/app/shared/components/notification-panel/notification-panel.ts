import {
  Component, OnInit, OnDestroy, HostListener,
  ElementRef, inject, ChangeDetectionStrategy, signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { filter, Subject, take, takeUntil } from 'rxjs';

import {
  Notification, NotificationType, NOTIFICATION_META,
} from '../../models/notification.model';
import { NotificationService } from '../../../core/services/notification-service';
import { NotificationNavigationService, NON_NAVIGABLE_TYPES } from '../../../core/services/open-notification/notification-navigation';
import { MatIconModule } from '@angular/material/icon';

// These notification types are only triggered by admin/super-admin actions.
// Display the actor as "Admin" to avoid revealing names.
const ADMIN_ONLY_TYPES = new Set<NotificationType>([
  'POST_APPROVED',
  'USER_FROZEN', 'USER_UNFROZEN',
  'USER_DELETED', 'USER_UPDATED',
  'USER_DELETION_REQUESTED', 'USER_DELETION_CANCELLED',
]);

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

    if (this.isNavigable(notification.type) && notification.resourceId) {
      this.navSvc.navigateTo(
        {
          type:       notification.type,
          resourceId: notification.resourceId,
          metadata:   notification.metadata ?? {},
        },
        notification.resourceUrl   // pass resourceUrl so user notifications navigate to /blog/:id directly
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

  /** Returns actor display name, anonymizing admin actors as "Admin". */
  getActorDisplay(n: Notification): string | null {
    if (!n.actorName) return null;
    return ADMIN_ONLY_TYPES.has(n.type) ? 'Admin' : n.actorName;
  }

  /**
   * Returns the correct display message for each notification type.
   * User notifications (userId != null) use first-person "your" language.
   * Admin notifications (userId == null) use third-person informational language.
   * Falls back to the backend message for any unhandled type.
   */
  getDisplayMessage(n: Notification): string {
    const isUser = n.userId !== null;
    const title  = n.metadata?.['postTitle'] ?? '';

    switch (n.type) {

      // ── Post events ─────────────────────────────────────────────────────────

      case 'POST_LIKED':
        if (isUser) {
          const count = n.metadata?.['likesCount'];
          const base  = `Someone liked your post${title ? ` "${title}"` : ''}!`;
          return count ? `${base} It now has ${count} ${count === 1 ? 'like' : 'likes'}.` : base;
        }
        return n.message;

      case 'POST_APPROVED':
        if (isUser) {
          const status = n.metadata?.['newStatus'];
          return status === 'published'
            ? `Great news! Your post${title ? ` "${title}"` : ''} is now live. Share it with the world!`
            : `Your post${title ? ` "${title}"` : ''} was reviewed and saved as a draft. You can publish it anytime.`;
        }
        return n.message;

      case 'POST_REJECTED':
        if (isUser) {
          const reason = n.metadata?.['rejectionReason'];
          return reason
            ? `Your post${title ? ` "${title}"` : ''} was not approved. Reason: ${reason}. Edit and resubmit anytime.`
            : `Your post${title ? ` "${title}"` : ''} was not approved. You can edit and resubmit it from your dashboard.`;
        }
        return n.message;

      case 'POST_PENDING_REVIEW':
        if (isUser)
          return `Your post${title ? ` "${title}"` : ''} has been submitted for review. We'll notify you once it's approved.`;
        return n.message;

      case 'POST_DELETED':
        if (isUser)
          return `Your post${title ? ` "${title}"` : ''} has been permanently removed by an admin.`;
        return n.message;

      case 'POST_MILESTONE': {
        const milestone = n.metadata?.['milestone'];
        return milestone ? `"${title}" reached ${milestone} likes! 🎉` : n.message;
      }

      // ── Comment events ───────────────────────────────────────────────────────

      case 'COMMENT_ADDED':
        if (isUser) {
          const actor = n.actorName?.trim() || 'Someone';
          return `${actor} commented on your post${title ? ` "${title}"` : ''}.`;
        }
        return n.message;

      case 'COMMENT_DELETED':
        if (isUser)
          return `A comment on your post${title ? ` "${title}"` : ''} was removed by an admin.`;
        return n.message;

      // ── Account events ────────────────────────────────────────────────────────

      case 'USER_FROZEN':
        if (isUser)
          return 'Your account has been suspended. Contact support if you believe this is a mistake.';
        return n.message;

      case 'USER_UNFROZEN':
        if (isUser)
          return 'Your account has been reactivated. Welcome back! You can now access all features.';
        return n.message;

      case 'USER_UPDATED':
        if (isUser)
          return 'An admin updated your profile information. Review the changes in your settings.';
        return n.message;

      // ── All other types: use backend message as-is ───────────────────────────
      default:
        return n.message;
    }
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
