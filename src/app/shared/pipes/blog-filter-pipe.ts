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
      const s = search.toLowerCase();
      blogs = blogs.filter(b =>
        b.title.toLowerCase().includes(s) ||
        ((b.user as any)?.name ?? '').toLowerCase().includes(s)
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