import {
  Component, inject, signal, computed, OnInit,
  DestroyRef, PLATFORM_ID, ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Meta, Title } from '@angular/platform-browser';
import { catchError } from 'rxjs/operators';
import { of } from 'rxjs';
import { Post } from '../../../../core/models/post.model';
import { TimeAgoPipe } from '../../../../shared/pipes/time-ago-pipe';
import { MobileBottomNav } from '../../../../shared/mobile-bottom-nav/mobile-bottom-nav';
import { BookmarkService } from '../../../../core/services/bookmark.service';
import { Auth } from '../../../../core/services/auth';
import { UserService } from '../../../user/services/user-service';

@Component({
  selector: 'app-bookmarks',
  standalone: true,
  imports: [CommonModule, RouterLink, TimeAgoPipe, MobileBottomNav],
  templateUrl: './bookmarks.html',
  styleUrl: './bookmarks.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BookmarksPage implements OnInit {
  private bookmarkService = inject(BookmarkService);
  private userService     = inject(UserService);
  private auth            = inject(Auth);
  private platformId      = inject(PLATFORM_ID);
  private destroyRef      = inject(DestroyRef);
  private router          = inject(Router);
  private meta            = inject(Meta);
  private titleSvc        = inject(Title);

  posts        = signal<Post[]>([]);
  isLoaded     = signal(false);
  isLoggedIn   = computed(() => this.auth.isAuthorized());
  showConfirm  = signal(false);
  page         = signal(1);
  totalPages   = signal(1);
  total        = signal(0);

  // For guests: local bookmark count
  localCount = computed(() => this.bookmarkService.bookmarkedIds().size);

  ngOnInit(): void {
    this.titleSvc.setTitle('My Bookmarks - ApnaInsights');
    this.meta.updateTag({ name: 'robots', content: 'noindex, nofollow' });
    this.meta.updateTag({ name: 'description', content: 'Your saved articles on ApnaInsights.' });

    if (!isPlatformBrowser(this.platformId)) { this.isLoaded.set(true); return; }

    const userId = this.auth.userId();
    if (userId) {
      this.loadFromServer(userId);
    } else {
      // Guest - show localStorage count only (can't show posts without API)
      this.isLoaded.set(true);
    }
  }

  private loadFromServer(userId: string, p = 1): void {
    this.isLoaded.set(false);
    this.userService.getBookmarkedPosts(userId, p)
      .pipe(
        catchError(() => of({ data: [], total: 0, totalPages: 1 })),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((res: any) => {
        this.posts.set(res.data ?? []);
        this.total.set(res.total ?? 0);
        this.totalPages.set(res.totalPages ?? 1);
        this.page.set(p);
        this.isLoaded.set(true);
      });
  }

  removeBookmark(postId: string): void {
    this.bookmarkService.toggle(postId);
    // Remove from local list immediately
    this.posts.update(list => list.filter(p => p._id !== postId));
    this.total.update(t => Math.max(0, t - 1));
  }

  clearAll(): void {
    const userId = this.auth.userId();
    const ids = [...this.bookmarkService.bookmarkedIds()];
    ids.forEach(id => this.bookmarkService.toggle(id));
    this.posts.set([]);
    this.total.set(0);
    this.showConfirm.set(false);
  }

  loadPage(p: number): void {
    const userId = this.auth.userId();
    if (userId) this.loadFromServer(userId, p);
  }

  navigateToBlog(post: Post): void {
    this.router.navigate(['/blog', (post as any).slug || post._id]);
  }

  readingTime(post: Post): number {
    if (post.readingTimeMinutes) return post.readingTimeMinutes;
    const text = (post.content ?? '').replace(/<[^>]*>/g, '');
    return Math.max(1, Math.ceil(text.trim().split(/\s+/).length / 200));
  }

  getAuthor(post: Post): string {
    return (post.user as any)?.name ?? 'Anonymous';
  }

  trackById(_: number, p: Post): string { return p._id; }
}
