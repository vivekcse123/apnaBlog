import { User } from "../../features/user/models/user.mode";

export interface Comment {
  _id: string;
  comment: string;
  email: string;
  user?: User | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Post {
  _id: string;
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
  status: 'draft' | 'published';
  createdAt: Date;
  updatedAt: Date;
}