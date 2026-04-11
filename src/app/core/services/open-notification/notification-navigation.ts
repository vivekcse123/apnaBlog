import { Injectable, inject } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { Subject, filter, take } from 'rxjs';
import { Auth } from '../../services/auth';
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

  private _openModal$ = new Subject<NotificationNavEvent>();
  openModal$ = this._openModal$.asObservable();

  navigateTo(event: NotificationNavEvent, resourceUrl?: string | null): void {
    if (NON_NAVIGABLE_TYPES.includes(event.type)) return;

    const hasValidResource = event.resourceId &&
                             event.resourceId !== 'null' &&
                             event.resourceId !== 'undefined';
    if (!hasValidResource) return;

    const isAdmin = this.authService.isAdmin();

    if (isAdmin) {
      const adminId = this.authService.getCurrentUser()?.id
                   ?? this.authService.getCurrentUser()?.id;
      if (!adminId) return;

      const targetPath = POST_NOTIFICATION_TYPES.includes(event.type)
        ? ['admin', adminId, 'manage-blogs']
        : USER_NOTIFICATION_TYPES.includes(event.type)
          ? ['admin', adminId, 'manage-users']
          : null;

      if (!targetPath) return;

      const currentUrl = this.router.url;
      const targetUrl  = '/' + targetPath.join('/');

      if (currentUrl === targetUrl) {
        this._openModal$.next(event);
      } else {
        this.router.navigate(targetPath);
        this.router.events
          .pipe(filter(e => e instanceof NavigationEnd), take(1))
          .subscribe(() => {
            setTimeout(() => this._openModal$.next(event), 100);
          });
      }

    } else {
      const validUrl = resourceUrl &&
                       !resourceUrl.includes('null') &&
                       !resourceUrl.includes('undefined');
      if (validUrl) {
        this.router.navigateByUrl(resourceUrl!);
      } else if (POST_NOTIFICATION_TYPES.includes(event.type)) {
        this.router.navigate(['/blog', event.resourceId]);
      }
    }
  }
}
