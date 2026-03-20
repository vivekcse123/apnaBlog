import { Component, inject, signal, computed, OnInit, DestroyRef } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { PostService } from '../../../post/services/post-service';
import { Post } from '../../../../core/models/post.model';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [RouterLink, CommonModule, FormsModule],
  templateUrl: './home.html',
  styleUrl: './home.css',
})
export class Home implements OnInit {
  private postService = inject(PostService);
  private destroyRef  = inject(DestroyRef);

  // ── All published posts ────────────────────────────────
  allPosts    = signal<Post[]>([]);
  isLoading   = signal(true);

  // ── Search & Filter ────────────────────────────────────
  searchQuery     = '';
  selectedCategory = signal('');
  selectedSort     = signal('newest');

  // ── Filtered posts ─────────────────────────────────────
  filteredPosts = computed(() => {
    let posts = this.allPosts();

    if (this.selectedCategory()) {
      posts = posts.filter(p =>
        p.categories.includes(this.selectedCategory())
      );
    }

    if (this.searchQuery.trim()) {
      const q = this.searchQuery.toLowerCase();
      posts = posts.filter(p =>
        p.title.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q)
      );
    }

    switch (this.selectedSort()) {
      case 'liked':   return [...posts].sort((a, b) => b.likesCount  - a.likesCount);
      case 'viewed':  return [...posts].sort((a, b) => b.views       - a.views);
      default:        return [...posts].sort((a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    }
  });

  trendingPosts = computed(() =>
    [...this.allPosts()]
      .sort((a, b) => b.likesCount - a.likesCount)
      .slice(0, 4)
  );

  hotPosts = computed(() =>
    [...this.allPosts()]
      .sort((a, b) => b.views - a.views)
      .slice(0, 4)
  );

  latestPosts = computed(() =>
    [...this.allPosts()]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 4)
  );

  categories = ['Village', 'Technology', 'Health', 'Education', 'Business', 'Entertainment'];

  categoryEmojis: Record<string, string> = {
    Village: '🌾', Technology: '💻', Health: '🏥',
    Education: '🎓', Business: '💼', Entertainment: '🎬',
    Lifestyle: '🌿', Social: '🤝'
  };

  getCategoryCount(cat: string): number {
    return this.allPosts().filter(p => p.categories.includes(cat)).length;
  }

  ngOnInit(): void {
    this.loadPosts();
  }

  loadPosts(): void {
    this.postService.getAllPost(1, 100)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          const published = (res.data ?? []).filter((p: Post) => p.status === 'published');
          this.allPosts.set(published);
          this.isLoading.set(false);
        },
        error: (err) => {
          console.error(err?.error?.message);
          this.isLoading.set(false);
        }
      });
  }

  onSearch(value: string): void {
    this.searchQuery = value;
  }
  // getFallbackImage(index: number): string {
  //   return `https://picsum.photos/400/250?random=${index}`;
  // }
}