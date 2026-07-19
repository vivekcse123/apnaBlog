import {
  Component, OnInit, OnDestroy, HostListener,
  ElementRef, inject, ChangeDetectionStrategy, signal, effect
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { filter, Subject, take, takeUntil } from 'rxjs';

import {
  Notification, NotificationType, NOTIFICATION_META,
} from '../../models/notification.model';
import { NotificationService } from '../../../core/services/notification-service';
import { NotificationNavigationService, NON_NAVIGABLE_TYPES } from '../../../core/services/open-notification/notification-navigation';
import { PanelCoordinator } from '../../../core/services/panel-coordinator';

const PANEL_ID = 'notifications';

const ADMIN_ONLY_TYPES = new Set<NotificationType>([
  'POST_APPROVED',
  'USER_FROZEN', 'USER_UNFROZEN',
  'USER_DELETED', 'USER_UPDATED',
  'USER_DELETION_REQUESTED', 'USER_DELETION_CANCELLED',
]);

// SVG paths keyed by icon category
const ICON_SVGS: Record<string, string> = {
  login:    `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>`,
  user:     `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
  follow:   `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>`,
  bell:     `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>`,
  key:      `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 11-7.778 7.778 5.5 5.5 0 017.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>`,
  lock:     `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>`,
  edit:     `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`,
  trash:    `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>`,
  trophy:   `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9H4.5a2.5 2.5 0 010-5H6"/><path d="M18 9h1.5a2.5 2.5 0 000-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0012 0V2z"/></svg>`,
  heart:    `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>`,
  clock:    `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
  check:    `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>`,
  reject:   `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>`,
  comment:  `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>`,
  reply:    `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 00-4-4H4"/></svg>`,
  freeze:   `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>`,
  unfreeze: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
  settings: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>`,
  xmark:    `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
  warn:     `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
  info:     `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
  video:    `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>`,
};

const ICON_MAP: Partial<Record<NotificationType, string>> = {
  USER_LOGIN:               'login',
  USER_REGISTERED:          'user',
  USER_FOLLOWED:            'follow',
  SUBSCRIBER_ADDED:         'bell',
  PASSWORD_CHANGED:         'key',
  PASSWORD_RESET_REQUESTED: 'lock',
  PASSWORD_RESET_COMPLETED: 'check',
  POST_PUBLISHED:           'edit',
  POST_UPDATED:             'edit',
  POST_DELETED:             'trash',
  POST_MILESTONE:           'trophy',
  POST_LIKED:               'heart',
  POST_PENDING_REVIEW:      'clock',
  POST_APPROVED:            'check',
  POST_REJECTED:            'reject',
  COMMENT_ADDED:            'comment',
  COMMENT_DELETED:          'trash',
  COMMENT_REPLIED:          'reply',
  MESSAGE_RECEIVED:         'comment',
  SHORT_PUBLISHED:          'video',
  SHORT_LIKED:              'heart',
  SHORT_COMMENTED:          'comment',
  SHORT_APPROVED:           'check',
  SHORT_REJECTED:           'reject',
  USER_FROZEN:              'freeze',
  USER_UNFROZEN:            'unfreeze',
  USER_UPDATED:             'settings',
  USER_DELETED:             'xmark',
  USER_DELETION_REQUESTED:  'warn',
  USER_DELETION_CANCELLED:  'check',
  info:                     'info',
  warning:                  'warn',
  success:                  'check',
  error:                    'xmark',
};

@Component({
  selector: 'app-notification-panel',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './notification-panel.html',
  styleUrls: ['./notification-panel.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotificationPanel implements OnInit, OnDestroy {

  private svc         = inject(NotificationService);
  private navSvc      = inject(NotificationNavigationService);
  private elRef       = inject(ElementRef);
  private sanitizer   = inject(DomSanitizer);
  private coordinator = inject(PanelCoordinator);
  private destroy$    = new Subject<void>();

  notifications = signal<Notification[]>([]);
  unreadCount   = signal(0);
  loading       = signal(false);
  panelOpen     = signal(false);
  refreshing    = signal(false);
  clearingAll   = signal(false);

  readonly meta = NOTIFICATION_META;

  constructor() {
    effect(() => { if (this.panelOpen()) this.coordinator.open(PANEL_ID); });
  }

  ngOnInit(): void {
    this.coordinator.active$
      .pipe(takeUntil(this.destroy$))
      .subscribe(active => {
        if (active !== PANEL_ID) this.panelOpen.set(false);
      });

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
    return this.meta[type] ?? { icon: '', color: '#999', label: 'Unknown' };
  }

  getIconSvg(type: NotificationType): SafeHtml {
    const key = ICON_MAP[type] ?? 'bell';
    return this.sanitizer.bypassSecurityTrustHtml(ICON_SVGS[key] ?? ICON_SVGS['bell']);
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

  @HostListener('keydown.escape')
  onEscape(): void {
    this.panelOpen.set(false);
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
        notification.resourceUrl,
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

  getActorDisplay(n: Notification): string | null {
    if (!n.actorName) return null;
    return ADMIN_ONLY_TYPES.has(n.type) ? 'Admin' : n.actorName;
  }

  getDisplayMessage(n: Notification): string {
    const isUser = n.userId !== null;
    const title  = n.metadata?.['postTitle'] ?? n.metadata?.['shortTitle'] ?? '';

    switch (n.type) {

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
        return milestone ? `"${title}" reached ${milestone} likes!` : n.message;
      }

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

      case 'COMMENT_REPLIED': {
        if (isUser) {
          const actor = n.actorName?.split(' ')[0] || 'Someone';
          return title
            ? `${actor} replied to your comment on "${title}".`
            : `${actor} replied to your comment.`;
        }
        return n.message;
      }

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

      case 'USER_FOLLOWED': {
        if (isUser) {
          const actor = n.actorName?.split(' ')[0] || 'Someone';
          return `${actor} started following you.`;
        }
        return n.message;
      }

      case 'SUBSCRIBER_ADDED': {
        if (isUser) {
          const actor = n.actorName?.split(' ')[0] || 'Someone';
          return `${actor} subscribed to your channel.`;
        }
        return n.message;
      }

      case 'SHORT_LIKED':
        if (isUser) {
          const count = n.metadata?.['likesCount'];
          const base  = `Someone liked your short${title ? ` "${title}"` : ''}!`;
          return count ? `${base} It now has ${count} ${count === 1 ? 'like' : 'likes'}.` : base;
        }
        return n.message;

      case 'SHORT_COMMENTED':
        if (isUser) {
          const actor = n.actorName?.trim() || 'Someone';
          return `${actor} commented on your short${title ? ` "${title}"` : ''}.`;
        }
        return n.message;

      case 'SHORT_APPROVED':
        if (isUser)
          return `Your short${title ? ` "${title}"` : ''} has been approved and is now live!`;
        return n.message;

      case 'SHORT_REJECTED':
        if (isUser) {
          const reason = n.metadata?.['rejectionReason'];
          return reason
            ? `Your short${title ? ` "${title}"` : ''} was not approved. Reason: ${reason}.`
            : `Your short${title ? ` "${title}"` : ''} was not approved. Please review and resubmit.`;
        }
        return n.message;

      case 'SHORT_PUBLISHED':
        if (isUser)
          return `Your short${title ? ` "${title}"` : ''} is now live and visible to everyone!`;
        return n.message;

      case 'MESSAGE_RECEIVED': {
        if (isUser) {
          const actor = n.actorName?.split(' ')[0] || 'Someone';
          return `${actor} sent you a message.`;
        }
        return n.message;
      }

      default:
        return n.message;
    }
  }

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
