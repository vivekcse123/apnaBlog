// notification.model.ts
export type NotificationType =
  // Admin
  | 'USER_REGISTERED'
  | 'POST_CREATED'
  | 'POST_UPDATED'
  | 'PASSWORD_CHANGED'
  | 'PASSWORD_RESET_REQUESTED'
  | 'PASSWORD_RESET_COMPLETED'
  | 'USER_REPORTED'
  | 'USER_LOGIN'
  | 'COMMENT_DELETED'
  | 'POST_PUBLISHED'
  | 'POST_DELETED'
  // User-facing
  | 'COMMENT_ADDED'
  | 'POST_LIKED'
  | 'COMMENT_LIKED'
  | 'REPLY_ADDED'
  | 'MENTION';

export interface Notification {
  id:          string;
  type:        NotificationType;
  title:       string;
  message:     string;
  isRead:      boolean;
  actorName:   string;
  actorAvatar: string | null;
  resourceId:  string | null;
  resourceUrl: string | null;
  createdAt:   string;
}

export interface NotificationResponse {
  notifications: Notification[];
  unreadCount:   number;
  totalCount:    number;
}

export const NOTIFICATION_META: Record<NotificationType, { icon: string; color: string; label: string }> = {
  // Admin
  USER_REGISTERED:           { icon: 'person_add',      color: '#4CAF50', label: 'New User'            },
  POST_CREATED:              { icon: 'article',          color: '#2196F3', label: 'Post Created'        },
  POST_UPDATED:              { icon: 'edit',             color: '#FF9800', label: 'Post Updated'        },
  POST_PUBLISHED:            { icon: 'publish',          color: '#00BCD4', label: 'Post Published'      },
  POST_DELETED:              { icon: 'delete',           color: '#F44336', label: 'Post Deleted'        },
  PASSWORD_CHANGED:          { icon: 'lock',             color: '#9C27B0', label: 'Password Changed'    },
  PASSWORD_RESET_REQUESTED:  { icon: 'lock_reset',       color: '#FF5722', label: 'Password Reset'     },
  PASSWORD_RESET_COMPLETED:  { icon: 'lock_open',        color: '#8BC34A', label: 'Reset Done'         },
  USER_REPORTED:             { icon: 'flag',             color: '#F44336', label: 'User Reported'       },
  USER_LOGIN:                { icon: 'login',            color: '#607D8B', label: 'User Login'          },
  COMMENT_DELETED:           { icon: 'comment',          color: '#FF5722', label: 'Comment Deleted'     },
  // User-facing
  COMMENT_ADDED:             { icon: 'chat_bubble',      color: '#2196F3', label: 'New Comment'         },
  POST_LIKED:                { icon: 'favorite',         color: '#E91E63', label: 'Post Liked'          },
  COMMENT_LIKED:             { icon: 'thumb_up',         color: '#FF9800', label: 'Comment Liked'       },
  REPLY_ADDED:               { icon: 'reply',            color: '#00BCD4', label: 'New Reply'           },
  MENTION:                   { icon: 'alternate_email',  color: '#9C27B0', label: 'Mention'             },
};