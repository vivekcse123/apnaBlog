import {
  Component, inject, signal, computed, OnInit,
  DestroyRef, PLATFORM_ID, ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Meta, Title } from '@angular/platform-browser';
import { PostService } from '../../../post/services/post-service';
import { AllPostsCache } from '../../../../core/services/all-posts-cache';
import { catchError } from 'rxjs/operators';
import { of } from 'rxjs';
import { Post } from '../../../../core/models/post.model';
import { TimeAgoPipe } from '../../../../shared/pipes/time-ago-pipe';

@Component({
  selector: 'app-bookmarks',
  standalone: true,
  imports: [CommonModule, RouterLink, TimeAgoPipe],
  templateUrl: './bookmarks.html',
  styleUrl: './bookmarks.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BookmarksPage implements OnInit {
  private postService   = inject(PostService);
  private allPostsCache = inject(AllPostsCache);
  private platformId  = inject(PLATFORM_ID);
  private destroyRef  = inject(DestroyRef);
  private meta        = inject(Meta);
  private titleSvc    = inject(Title);

  bookmarkedIds = signal<Set<string>>(new Set());
  allPosts      = signal<Post[]>([]);
  isLoaded      = signal(false);
  showConfirm   = signal(false);

  bookmarkedPosts = computed(() => {
    const ids = this.bookmarkedIds();
    return this.allPosts().filter(p => ids.has(p._id));
  });

  ngOnInit(): void {
    this.titleSvc.setTitle('My Bookmarks — ApnaInsights');
    this.meta.updateTag({ name: 'robots', content: 'noindex, nofollow' });
    this.meta.updateTag({ name: 'description', content: 'Your saved articles on ApnaInsights.' });

    if (!isPlatformBrowser(this.platformId)) { this.isLoaded.set(true); return; }
    this.restoreBookmarks();
    this.loadPosts();
  }

  private restoreBookmarks(): void {
    try {
      const s = localStorage.getItem('apna_bookmarked_posts');
      if (s) this.bookmarkedIds.set(new Set(JSON.parse(s)));
    } catch { }
  }

  private loadPosts(): void {
    const cached = this.allPostsCache.get();
    if (cached.length) {
      this.allPosts.set(cached.filter(p => p.status === 'published'));
      this.isLoaded.set(true);
      return;
    }
    this.postService.getAllPublished()
      .pipe(
        catchError(() => of([] as Post[])),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(posts => {
        const published = posts.filter(p => p.status === 'published');
        this.allPostsCache.set(published);
        this.allPosts.set(published);
        this.isLoaded.set(true);
      });
  }

  removeBookmark(postId: string): void {
    const ids = new Set(this.bookmarkedIds());
    ids.delete(postId);
    this.bookmarkedIds.set(ids);
    try { localStorage.setItem('apna_bookmarked_posts', JSON.stringify([...ids])); } catch { }
  }

  clearAll(): void {
    this.bookmarkedIds.set(new Set());
    this.showConfirm.set(false);
    try { localStorage.removeItem('apna_bookmarked_posts'); } catch { }
  }

  readingTime(post: Post): number {
    const text = (post.content ?? '').replace(/<[^>]*>/g, '');
    return Math.max(1, Math.ceil(text.trim().split(/\s+/).length / 200));
  }

  trackById(_: number, p: Post): string { return p._id; }
}
