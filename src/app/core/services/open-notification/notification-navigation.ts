import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';
import { NotificationType } from '../../../shared/models/notification.model';

export interface NotificationNavEvent {
  type:       NotificationType;
  resourceId: string;
  metadata:   Record<string, any>;
}

// Notification types that open post modal
export const POST_NOTIFICATION_TYPES: NotificationType[] = [
  'POST_LIKED', 'POST_MILESTONE', 'COMMENT_ADDED',
  'COMMENT_DELETED', 'POST_PUBLISHED', 'POST_UPDATED',
];

// Notification types that open user modal
export const USER_NOTIFICATION_TYPES: NotificationType[] = [
  'USER_REGISTERED', 'USER_LOGIN', 'USER_FROZEN', 'USER_UNFROZEN',
  'USER_UPDATED', 'USER_DELETION_REQUESTED', 'USER_DELETION_CANCELLED',
  'PASSWORD_CHANGED', 'PASSWORD_RESET_REQUESTED', 'PASSWORD_RESET_COMPLETED',
];

// Types with nothing to navigate to
export const NON_NAVIGABLE_TYPES: NotificationType[] = [
  'POST_DELETED', 'USER_DELETED', 'info', 'warning', 'success', 'error',
];

@Injectable({ providedIn: 'root' })
export class NotificationNavigationService {
  private _navigate$ = new Subject<NotificationNavEvent>();
  navigate$ = this._navigate$.asObservable();

  open(event: NotificationNavEvent): void {
    this._navigate$.next(event);
  }
}