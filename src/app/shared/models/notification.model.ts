export type NotificationType =
  | 'USER_LOGIN' | 'USER_REGISTERED'
  | 'PASSWORD_CHANGED' | 'PASSWORD_RESET_REQUESTED' | 'PASSWORD_RESET_COMPLETED'
  | 'POST_PUBLISHED' | 'POST_UPDATED' | 'POST_DELETED' | 'POST_MILESTONE' | 'POST_LIKED'
  | 'POST_PENDING_REVIEW' | 'POST_APPROVED' | 'POST_REJECTED'
  | 'COMMENT_ADDED' | 'COMMENT_DELETED'
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
  USER_LOGIN:                  { icon: '🔐', color: '#3b82f6', label: 'Login'               },
  USER_REGISTERED:             { icon: '👤', color: '#10b981', label: 'New User'            },
  PASSWORD_CHANGED:            { icon: '🔑', color: '#f59e0b', label: 'Password Changed'    },
  PASSWORD_RESET_REQUESTED:    { icon: '🔒', color: '#ef4444', label: 'Reset Requested'     },
  PASSWORD_RESET_COMPLETED:    { icon: '🔓', color: '#10b981', label: 'Reset Completed'     },
  POST_PUBLISHED:              { icon: '📄', color: '#6366f1', label: 'Post Published'      },
  POST_UPDATED:                { icon: '✏️', color: '#8b5cf6', label: 'Post Updated'        },
  POST_DELETED:                { icon: '🗑️', color: '#ef4444', label: 'Post Deleted'        },
  POST_MILESTONE:              { icon: '🏆', color: '#f59e0b', label: 'Milestone'           },
  POST_LIKED:                  { icon: '❤️', color: '#ec4899', label: 'New Like'            },
  POST_PENDING_REVIEW:         { icon: '⏳', color: '#f59e0b', label: 'Pending Review'      },
  POST_APPROVED:               { icon: '✅', color: '#10b981', label: 'Post Approved'       },
  POST_REJECTED:               { icon: '❌', color: '#ef4444', label: 'Post Rejected'       },
  COMMENT_ADDED:               { icon: '💬', color: '#06b6d4', label: 'New Comment'         },
  COMMENT_DELETED:             { icon: '🚫', color: '#94a3b8', label: 'Comment Deleted'     },
  USER_FROZEN:                 { icon: '🚫', color: '#ef4444', label: 'Account Frozen'      },
  USER_UNFROZEN:               { icon: '✅', color: '#10b981', label: 'Account Unfrozen'    },
  USER_UPDATED:                { icon: '⚙️', color: '#3b82f6', label: 'Profile Updated'     },
  USER_DELETED:                { icon: '❌', color: '#ef4444', label: 'Account Deleted'     },
  USER_DELETION_REQUESTED:     { icon: '⚠️', color: '#f59e0b', label: 'Deletion Requested'  },
  USER_DELETION_CANCELLED:     { icon: '✅', color: '#10b981', label: 'Deletion Cancelled'  },
  info:                        { icon: 'ℹ️', color: '#3b82f6', label: 'Info'                },
  warning:                     { icon: '⚠️', color: '#f59e0b', label: 'Warning'             },
  success:                     { icon: '✅', color: '#10b981', label: 'Success'             },
  error:                       { icon: '❌', color: '#ef4444', label: 'Error'               },
};