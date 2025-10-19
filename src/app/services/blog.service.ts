import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { createPost } from '../user/modals/create-post.modal';
import { HttpClient } from '@angular/common/http';

interface Blog {
  id: number;
  title: string;
  content: string;
  image?: string;
  author: { name: string; id: number };
  date: Date;
  comments: { user: { name: string; id: number }, text: string, date: Date }[];
}

@Injectable({
  providedIn: 'root'
})
export class BlogService {

  private blogURL = "";

  private blogs: Blog[] = [
    {
      id: 1,
      title: 'My First Village Story',
      content: 'This is a detailed story about my village...',
      image: 'https://via.placeholder.com/600x300',
      author: { name: 'Vivek Verma', id: 1 },
      date: new Date('2025-10-15'),
      comments: [
        { user: { name: 'Ravi', id: 2 }, text: 'Nice story!', date: new Date('2025-10-16') },
      ]
    },
    {
      id: 2,
      title: 'Festivals in My Village',
      content: 'Village festivals are full of color and culture...',
      image: 'https://via.placeholder.com/600x300',
      author: { name: 'Vivek Verma', id: 1 },
      date: new Date('2025-10-14'),
      comments: []
    }
  ];

  constructor(private http: HttpClient) { }

  createBlog(obj: createPost): Observable<any>{
    return this.http.post<any>(`${this.blogURL}/create-blog`, obj)
  }

  getBlogById(id: number): Observable<Blog> {
    const blog = this.blogs.find(b => b.id === id);
    return of(blog!);
  }

  deleteBlog(id: number): Observable<boolean> {
    this.blogs = this.blogs.filter(b => b.id !== id);
    return of(true);
  }

  addComment(blogId: number, comment: { user: { name: string; id: number }, text: string, date: Date }): Observable<boolean> {
    const blog = this.blogs.find(b => b.id === blogId);
    if (blog) {
      blog.comments.push(comment);
      return of(true);
    }
    return of(false);
  }

  getAllBlogs(): Observable<Blog[]> {
    return of(this.blogs);
  }

}
