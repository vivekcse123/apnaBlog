export type CallbackStatus =
  | 'pending' | 'accepted' | 'rejected' | 'scheduled' | 'completed' | 'cancelled' | 'expired';

export interface CallbackActivityEntry {
  action: string;
  byRole: string;
  byUser: string | null;
  note: string;
  at: string;
}

export interface CallbackFeedback {
  rating: number;
  comment: string;
  submittedAt: string;
}

export interface CallbackRequestRecord {
  _id: string;
  user: string;
  userName: string;
  userEmail: string;
  userPhone: string;
  expertSlug: string;
  expertName: string;
  category: string;
  topic: string;
  preferredDate: string;
  preferredTime: string;
  alternateTime: string;
  message: string;
  status: CallbackStatus;
  scheduledAt: string | null;
  feedback?: CallbackFeedback | null;
  activityLog: CallbackActivityEntry[];
  createdAt: string;
  updatedAt: string;
  /** 'booking' = submitted via "Book Session" (duration set); 'callback' = via "Request Callback". */
  type?: 'callback' | 'booking';
  duration?: number | null;
  /** Only populated on GET /callback-requests/for-mentor - the requester's current Premium status. */
  userIsPremium?: boolean;
  userPremiumSince?: string | null;
}

export interface SubmitFeedbackPayload {
  rating: number;
  comment?: string;
}

export interface CreateCallbackRequestPayload {
  expertSlug: string;
  expertName: string;
  category?: string;
  topic: string;
  preferredDate: string;
  preferredTime: string;
  alternateTime?: string;
  phone?: string;
  message?: string;
  /** Defaults to 'callback' server-side if omitted. */
  type?: 'callback' | 'booking';
  /** Required (15/30/45/60) when type is 'booking'. */
  duration?: number;
}
