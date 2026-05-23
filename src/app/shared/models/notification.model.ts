export type NotificationType =
  | 'USER_LOGIN' | 'USER_REGISTERED' | 'USER_FOLLOWED' | 'SUBSCRIBER_ADDED'
  | 'PASSWORD_CHANGED' | 'PASSWORD_RESET_REQUESTED' | 'PASSWORD_RESET_COMPLETED'
  | 'POST_PUBLISHED' | 'POST_UPDATED' | 'POST_DELETED' | 'POST_MILESTONE' | 'POST_LIKED'
  | 'POST_PENDING_REVIEW' | 'POST_APPROVED' | 'POST_REJECTED'
  | 'COMMENT_ADDED' | 'COMMENT_DELETED' | 'COMMENT_REPLIED'
  | 'SHORT_PUBLISHED' | 'SHORT_LIKED' | 'SHORT_COMMENTED' | 'SHORT_APPROVED' | 'SHORT_REJECTED'
  | 'USER_FROZEN' | 'USER_UNFROZEN' | 'USER_UPDATED' | 'USER_DELETED'
  | 'USER_DELETION_REQUESTED' | 'USER_DELETION_CANCELLED'
  | 'info' | 'warning' | 'success' | 'error';

export interface Notification {
  id: string;           // ✅ normalized from _id in the service
  userId:      string | null;
  type:        NotificationType;
  title:       string;
  message:     string;
  actorName:   string | null;
  resourceId:  string | null;
  resourceUrl: string | null;
  priority:    'low' | 'medium' | 'high';
  isRead:      boolean;
  metadata:    Record<string, any>;
  createdAt:   string;
  updatedAt:   string;
}

export interface NotificationResponse {
  notifications: Notification[];
  unreadCount:   number;
  pagination?: {
    total: number;
    page:  number;
    limit: number;
    pages: number;
  };
}

// ── Notification panel display metadata ───────────────────────────────────────
export const NOTIFICATION_META: Record<NotificationType, { icon: string; color: string; label: string }> = {
  USER_LOGIN:                  { icon: '🔐', color: '#3b82f6', label: 'Sign In'            },
  USER_REGISTERED:             { icon: '🎉', color: '#10b981', label: 'New Member'         },
  USER_FOLLOWED:               { icon: '👥', color: '#8b5cf6', label: 'New Follower'       },
  PASSWORD_CHANGED:            { icon: '🔑', color: '#f59e0b', label: 'Password'           },
  PASSWORD_RESET_REQUESTED:    { icon: '🔒', color: '#ef4444', label: 'Reset Requested'    },
  PASSWORD_RESET_COMPLETED:    { icon: '🔓', color: '#10b981', label: 'Reset Done'         },
  POST_PUBLISHED:              { icon: '📝', color: '#6366f1', label: 'Published'          },
  POST_UPDATED:                { icon: '✏️', color: '#8b5cf6', label: 'Post Edited'        },
  POST_DELETED:                { icon: '🗑️', color: '#ef4444', label: 'Post Removed'       },
  POST_MILESTONE:              { icon: '🏆', color: '#f59e0b', label: 'Milestone'          },
  POST_LIKED:                  { icon: '❤️', color: '#ec4899', label: 'New Like'           },
  POST_PENDING_REVIEW:         { icon: '⏳', color: '#f59e0b', label: 'In Review'          },
  POST_APPROVED:               { icon: '🎉', color: '#10b981', label: 'Approved'           },
  POST_REJECTED:               { icon: '✏️', color: '#ef4444', label: 'Needs Changes'      },
  COMMENT_ADDED:               { icon: '💬', color: '#06b6d4', label: 'New Comment'        },
  COMMENT_DELETED:             { icon: '🚫', color: '#94a3b8', label: 'Comment Removed'    },
  COMMENT_REPLIED:             { icon: '↩️', color: '#06b6d4', label: 'New Reply'          },
  USER_FROZEN:                 { icon: '🚫', color: '#ef4444', label: 'Suspended'          },
  USER_UNFROZEN:               { icon: '✅', color: '#10b981', label: 'Reactivated'        },
  USER_UPDATED:                { icon: '⚙️', color: '#3b82f6', label: 'Profile Updated'    },
  USER_DELETED:                { icon: '❌', color: '#ef4444', label: 'Account Deleted'    },
  USER_DELETION_REQUESTED:     { icon: '⚠️', color: '#f59e0b', label: 'Deletion Requested' },
  USER_DELETION_CANCELLED:     { icon: '✅', color: '#10b981', label: 'Deletion Cancelled' },
  SUBSCRIBER_ADDED:            { icon: '🔔', color: '#8b5cf6', label: 'New Subscriber'     },
  SHORT_PUBLISHED:             { icon: '🎬', color: '#6366f1', label: 'Short Published'    },
  SHORT_LIKED:                 { icon: '❤️', color: '#ec4899', label: 'Short Liked'        },
  SHORT_COMMENTED:             { icon: '💬', color: '#06b6d4', label: 'Short Comment'      },
  SHORT_APPROVED:              { icon: '✅', color: '#10b981', label: 'Short Approved'     },
  SHORT_REJECTED:              { icon: '✏️', color: '#ef4444', label: 'Short Rejected'     },
  info:                        { icon: 'ℹ️', color: '#3b82f6', label: 'Info'               },
  warning:                     { icon: '⚠️', color: '#f59e0b', label: 'Warning'            },
  success:                     { icon: '✅', color: '#10b981', label: 'Success'            },
  error:                       { icon: '❌', color: '#ef4444', label: 'Error'              },
};