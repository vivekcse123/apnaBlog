import { Post } from './post.model';

export interface User {
  name: string;
  handle: string;
  profileImage?: string;
  about?: string;
  followersCount: number;
  followingCount: number;
  posts: Post[];
}
