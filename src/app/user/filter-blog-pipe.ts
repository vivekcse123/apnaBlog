import { Pipe, PipeTransform } from '@angular/core';
import { Post } from './modals/post.model';

@Pipe({
  name: 'filterBlog'
})
export class FilterBlogPipe implements PipeTransform {

  transform(posts: Post[], searchText: string = '', filterOption: string = ''): Post[] {
    if (!posts) return [];

    let filtered = posts;

    // Search filter
    if (searchText) {
      const lowerText = searchText.toLowerCase();
      filtered = filtered.filter(post => post.title.toLowerCase().includes(lowerText));
    }

    // Option filter
    if (filterOption === 'mostLiked') {
      filtered = filtered.slice().sort((a, b) => b.likes - a.likes);
    } else if (filterOption === 'mostCommented') {
      filtered = filtered.slice().sort((a, b) => b.commentsCount - a.commentsCount);
    } else if (filterOption === 'date') {
      filtered = filtered.slice().sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }

    return filtered;
  }
}
