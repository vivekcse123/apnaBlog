import { Post } from './post.model';

export interface User {
  name: string;
  handle: string;
  profileImage?: string;
  about?: string;
  joinedDate?: Date;
  followersCount: number;
  followingCount: number;
  posts: Post[];
}
