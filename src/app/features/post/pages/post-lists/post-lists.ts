import { Component, inject, signal, computed } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BlogFilterPipe } from '../../../../shared/pipes/blog-filter-pipe';
import { Post } from '../../../../core/models/post.mode';

@Component({
  selector: 'app-post-lists',
  standalone: true,
  imports: [CommonModule, FormsModule, BlogFilterPipe],
  templateUrl: './post-lists.html',
  styleUrl: './post-lists.css',
})
export class PostLists {

  private router = inject(Router);

  searchTitle: string = '';
  debounceValue = signal<string>('');
  selectedCategory = signal<string>('');
  selectedStatus = signal<string>('');

  private debounceTimer: any;

  debounceSearch(value: string): void {
    clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.debounceValue.set(value);
      this.currentPage.set(1);
    }, 400);
  }

  currentPage = signal<number>(1);
  itemsPerPage = signal<number>(5);

  totalPages = computed(() =>
    Math.ceil(this.allBlogs().length / this.itemsPerPage())
  );

  pages = computed(() =>
    Array.from({ length: this.totalPages() }, (_, i) => i + 1)
  );

  previousPage(): void {
    if (this.currentPage() > 1) {
      this.currentPage.update(p => p - 1);
    }
  }

  nextPage(): void {
    if (this.currentPage() < this.totalPages()) {
      this.currentPage.update(p => p + 1);
    }
  }

  goToPage(page: number): void {
    this.currentPage.set(page);
  }

  allBlogs = signal<Post[]>([
    {
      _id: '1',
      title: 'The Future of Technology',
      description: 'Exploring AI and automation trends',
      content: 'Full content about AI and automation goes here...',
      categories: ['Technology'],
      tags: ['AI', 'Automation', 'Future'],
      featuredImage: '',
      user: 'user_001',
      likesCount: 1240,
      commentsCount: 45,
      views: 5200,
      status: 'published',
      pusblishDate: new Date('2026-03-12'),
    },
    {
      _id: '2',
      title: 'Healthy Lifestyle Habits',
      description: 'Simple routines for better living',
      content: 'Full content about healthy lifestyle goes here...',
      categories: ['Health'],
      tags: ['Health', 'Lifestyle', 'Wellness'],
      featuredImage: '',
      user: 'user_002',
      likesCount: 87,
      commentsCount: 12,
      views: 530,
      status: 'draft',
      pusblishDate: new Date('2026-03-08'),
    },
    {
      _id: '3',
      title: 'Understanding REST vs GraphQL',
      description: 'A deep dive into modern API design',
      content: 'Full content about REST and GraphQL goes here...',
      categories: ['Development'],
      tags: ['REST', 'GraphQL', 'API'],
      featuredImage: '',
      user: 'user_003',
      likesCount: 540,
      commentsCount: 38,
      views: 2890,
      status: 'published',
      pusblishDate: new Date('2026-03-05'),
    },
    {
      _id: '4',
      title: '10 Tips for Better UX Design',
      description: 'Principles every designer should know',
      content: 'Full content about UX design tips goes here...',
      categories: ['Design'],
      tags: ['UX', 'Design', 'UI'],
      featuredImage: '',
      user: 'user_004',
      likesCount: 64,
      commentsCount: 9,
      views: 410,
      status: 'draft',
      pusblishDate: new Date('2026-03-01'),
    },
  ]);

  createBlog(): void {
    this.router.navigate(['/admin/create-blog']);
  }

  editBlog(id: string): void {
    this.router.navigate(['/admin/blogs/edit', id]);
  }

  deleteBlog(id: string): void {
    this.allBlogs.update(blogs => blogs.filter(b => b._id !== id));
  }

}