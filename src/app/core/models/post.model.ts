import { User } from "../../features/user/models/user.mode";

export interface McqOption {
  text: string;
}

export interface McqQuestion {
  _id?:         string;
  question:     string;
  options:      McqOption[];
  correctIndex: number;
  explanation?: string;
}

export interface FaqItem {
  _id?:      string;
  question:  string;
  answer:    string;
}

export interface Comment {
  _id: string;
  comment: string;
  email: string;
  name: string,
  user?: User | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface EditHistoryEntry {
  editedBy:      User | string | null;
  editedAt:      Date;
  changedFields: string[];
  changeNote?:   string;
}

export interface Post {
  _id: string;
  slug?: string;
  user: User;
  title: string;
  description: string;
  content: string;
  // Precomputed by the backend (~200 wpm from `content`) — list endpoints
  // exclude the full `content` body for payload size, so list views must
  // use this instead of computing reading time from content client-side.
  readingTimeMinutes?: number;
  // Exact word count, precomputed alongside readingTimeMinutes — needed
  // wherever precision matters (e.g. the admin thin-content audit), since
  // reversing readingTimeMinutes back into words loses precision.
  wordCount?: number;
  categories: string[];
  tags: string[];
  featuredImage: string;
  images?: string[];
  likesCount: number;
  commentsCount: number;
  comments: Comment[];   // ← fixed from string[]
  views: number;
  status: 'pending' | 'draft' | 'published' | 'rejected' | 'scheduled';
  scheduledAt?: string | Date | null;
  rejectionReason?: string | null;
  createdAt: Date;
  updatedAt: Date;

  // Audit trail
  lastEditedBy?:  User | string | null;
  lastEditedAt?:  Date | null;
  editHistory?:   EditHistoryEntry[];

  // Soft-delete request (user requests, admin approves)
  deleteRequested?:      boolean;
  deleteRequestReason?:  string | null;
  deleteRequestedAt?:    Date | null;

  // MCQ
  postType?:      'blog' | 'mcq';
  mcqQuestions?:  McqQuestion[];

  // FAQ section + FAQPage schema
  faqs?: FaqItem[];

  // Sponsorship
  isSponsored?:           boolean;
  sponsoredUntil?:        string | Date | null;
  sponsoredExpiryAction?: 'delete' | 'keep' | null;
  sponsorPriority?:       number;
  sponsorCtaText?:        string | null;
  sponsorCtaUrl?:         string | null;
  sponsorBrand?:          string | null;

  // Series
  seriesName?:  string;
  seriesOrder?: number | null;

  // Community
  hotScore?:          number;
  flagCount?:         number;
  isFlagged?:         boolean;
  challengeId?:       { _id: string; title: string; endDate: string; isActive: boolean } | string | null;
  isFeaturedWinner?:  boolean;
  featuredWinnerRank?: number | null;
}