export interface Post {
  _id: string,
  title: string;
  description: string;
  content: string;
  categories: string[];
  tags: string[];
  featuredImage: string;
  user: string;
  likesCount: number;
  commentsCount: number;
  views: number;
  status: string;
  pusblishDate: Date
}