export interface Post {
  id: number;
  title: string;
  content: string;
  imageUrl?: string;
  date: Date;
  likes: number; // from Post
  author: { 
    name: string; 
    id: number; 
  }; // from Blog
  commentsCount: number; // from Post
  comments: { 
    user: { name: string; id: number }; 
    text: string; 
    date: Date; 
  }[]; // from Blog
}
