import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { Auth } from '../auth';
import { NotificationType } from '../../../shared/models/notification.model';

export interface NotificationNavEvent {
  type:       NotificationType;
  resourceId: string;
  metadata:   Record<string, any>;
}

export const POST_NOTIFICATION_TYPES: NotificationType[] = [
  'POST_LIKED', 'POST_MILESTONE', 'COMMENT_ADDED',
  'COMMENT_DELETED', 'POST_PUBLISHED', 'POST_UPDATED',
];

export const USER_NOTIFICATION_TYPES: NotificationType[] = [
  'USER_REGISTERED', 'USER_LOGIN', 'USER_FROZEN', 'USER_UNFROZEN',
  'USER_UPDATED', 'USER_DELETION_REQUESTED', 'USER_DELETION_CANCELLED',
  'PASSWORD_CHANGED', 'PASSWORD_RESET_REQUESTED', 'PASSWORD_RESET_COMPLETED',
];

export const NON_NAVIGABLE_TYPES: NotificationType[] = [
  'POST_DELETED', 'USER_DELETED', 'info', 'warning', 'success', 'error',
];

@Injectable({ providedIn: 'root' })
export class NotificationNavigationService {
  private router      = inject(Router);
  private authService = inject(Auth);

  private _pendingEvent: NotificationNavEvent | null = null;

  navigateTo(event: NotificationNavEvent): void {
    if (NON_NAVIGABLE_TYPES.includes(event.type) || !event.resourceId) return;

    const adminId = this.authService.getCurrentUser()?.id
                 ?? this.authService.getCurrentUser()?.id;

    if (!adminId) return;

    this._pendingEvent = event;

    if (POST_NOTIFICATION_TYPES.includes(event.type)) {
      this.router.navigate(['admin', adminId, 'manage-blogs']);
    } else if (USER_NOTIFICATION_TYPES.includes(event.type)) {
      this.router.navigate(['admin', adminId, 'manage-users']);
    }
  }

  consumePendingEvent(): NotificationNavEvent | null {
    const event = this._pendingEvent;
    this._pendingEvent = null;
    return event;
  }
}