export interface BlogSettings {
  maxBlogsPerUser: number;
  defaultBlogStatus: 'draft' | 'published';
  autoApproveBlogs: boolean;
}

export interface Category {
  _id: string;
  name: string;
  slug: string;
  blogsCount?: number;
  createdAt: string;
}

export interface Tag {
  _id: string;
  name: string;
  slug: string;
  blogsCount?: number;
  createdAt: string;
}