import { Pipe, PipeTransform } from '@angular/core';
import { Post } from '../../core/models/post.model';

@Pipe({
  name: 'blogFilter',
  standalone: true
})
export class BlogFilterPipe implements PipeTransform {

  transform(blogs: Post[], search: string, category: string, status: string): Post[] {
    if (!blogs) return [];

    if (search) {
      blogs = blogs.filter(b =>
        b.title.toLowerCase().includes(search.toLowerCase())
      );
    }

    if (category) {
      blogs = blogs.filter(b =>
        b.categories.some((c: any) => c.toLowerCase() === category.toLowerCase())
      );
    }

    if (status) {
      blogs = blogs.filter(b =>
        b.status.toLowerCase() === status.toLowerCase()
      );
    }

    return blogs;
  }

}