export interface Post {
  id: number;
  title: string;
  content: string;
  imageUrl?: string;
  date: Date;
  likes: number;
  comments: number;
}
