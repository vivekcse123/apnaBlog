import { User } from "../../features/user/models/user.mode";

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
}

export interface Post {
  _id: string;
  slug?: string;
  user: User;
  title: string;
  description: string;
  content: string;
  categories: string[];
  tags: string[];
  featuredImage: string;
  likesCount: number;
  commentsCount: number;
  comments: Comment[];   // ← fixed from string[]
  views: number;
  status: 'pending' | 'draft' | 'published';
  createdAt: Date;
  updatedAt: Date;

  // Audit trail
  lastEditedBy?:  User | string | null;
  lastEditedAt?:  Date | null;
  editHistory?:   EditHistoryEntry[];
}