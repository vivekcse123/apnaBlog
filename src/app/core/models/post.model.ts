import { User } from "../../features/user/models/user.mode";

export interface Post {
  _id: string;
  user: User,
  title: string;
  description: string;
  content: string;
  categories: string[];
  tags: string[];
  featuredImage: string;
  userId: string;
  likesCount: number;
  commentsCount: number;
  views: number;
  status: 'draft' | 'published';
  createdAt: Date;   // from timestamps
  updatedAt: Date;   // from timestamps
}