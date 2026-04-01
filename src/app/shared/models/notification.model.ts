export type NotificationType =
  | 'USER_REGISTERED'
  | 'BLOG_CREATED'
  | 'BLOG_UPDATED'
  | 'BLOG_DELETED'
  | 'COMMENT_ADDED'
  | 'USER_REPORTED';

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
  actorName: string;
  actorAvatar?: string;
  resourceId?: string;
  resourceUrl?: string;
}

export interface NotificationResponse {
  notifications: Notification[];
  unreadCount: number;
  totalCount: number;
}

export const NOTIFICATION_META: Record<NotificationType,{ icon: string; color: string; label: string }> = {
  USER_REGISTERED: { icon: 'person_add', color: '#4CAF50', label: 'New User' },
  BLOG_CREATED: { icon: 'article', color: '#2196F3', label: 'New Blog' },
  BLOG_UPDATED: { icon: 'edit_note', color: '#FF9800', label: 'Blog Updated' },
  BLOG_DELETED: { icon: 'delete', color: '#F44336', label: 'Blog Deleted' },
  COMMENT_ADDED: { icon: 'comment', color: '#9C27B0', label: 'New Comment' },
  USER_REPORTED: { icon: 'flag', color: '#FF5722', label: 'User Reported' },
};