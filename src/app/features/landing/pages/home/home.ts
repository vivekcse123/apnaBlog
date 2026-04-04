import { Component, inject, signal, computed, OnInit, DestroyRef, Input, ChangeDetectionStrategy, WritableSignal} 
from '@angular/core';
import { ActivatedRoute, NavigationEnd, Router, RouterLink } from '@angular/router';
import { CommonModule, NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { finalize, debounceTime, distinctUntilChanged, filter } from 'rxjs/operators';
import { Subject } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { PostService } from '../../../post/services/post-service';
import { Post } from '../../../../core/models/post.model';
import { ReadBlog } from '../read-blog/read-blog';
import { ThemeService } from '../../../../core/services/theme-service';
import { Auth } from '../../../../core/services/auth';
import { UserService } from '../../../user/services/user-service';
import { User } from '../../../user/models/user.mode';
import { VisitorService } from '../../../../core/services/visitor';

const PAGE_SIZE = 4;

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [RouterLink, CommonModule, FormsModule, ReadBlog, NgTemplateOutlet],
  templateUrl: './home.html',
  styleUrl: './home.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Home implements OnInit {
  private postService    = inject(PostService);
  private destroyRef     = inject(DestroyRef);
  private route          = inject(ActivatedRoute);
  private router         = inject(Router);
  private auth           = inject(Auth);
  private userService    = inject(UserService);
  themeService           = inject(ThemeService);
  private visitorService = inject(VisitorService);

  @Input() standalone = true;

  allPosts         = signal<Post[]>([]);
  isLoading        = signal(true);
  isViewed         = signal(false);
  selectedId       = signal('');
  menuOpen: WritableSignal<boolean> = signal(false);
  searchQuery      = signal('');
  selectedCategory = signal('');
  selectedSort     = signal('newest');

  trendingPage = signal(0);
  hotPage      = signal(0);
  latestPage   = signal(0);

  likedPostIds     = signal<Set<string>>(new Set());

  commentDrawerPostId = signal<string | null>(null);
  commentText         = signal('');
  commentSubmitting   = signal(false);
  commentFeedback     = signal<{ type: 'success' | 'error'; msg: string } | null>(null);

  drawerComments        = signal<DrawerComment[]>([]);
  drawerCommentsLoading = signal(false);

  deletingCommentId = signal<string | null>(null);

  private currentUserData = signal<User | null>(null);
  private searchInput$    = new Subject<string>();

  private postsWithTs = computed(() =>
    this.allPosts().map(p => ({ ...p, _ts: new Date(p.createdAt).getTime() }))
  );

  private byLikes = computed(() =>
    [...this.postsWithTs()].sort((a, b) => b.likesCount - a.likesCount)
  );
  private byViews = computed(() =>
    [...this.postsWithTs()].sort((a, b) => b.views - a.views)
  );
  private byDate = computed(() =>
    [...this.postsWithTs()].sort((a, b) => b._ts - a._ts)
  );

  private trendingPool = computed(() => this.byLikes());

  private hotPool = computed(() => {
    const trendingIds = new Set(this.trendingPool().slice(0, PAGE_SIZE).map(p => p._id));
    return this.byViews().filter(p => !trendingIds.has(p._id));
  });

  private latestPool = computed(() => {
    const usedIds = new Set([
      ...this.trendingPool().slice(0, PAGE_SIZE).map(p => p._id),
      ...this.hotPool().slice(0, PAGE_SIZE).map(p => p._id),
    ]);
    return this.byDate().filter(p => !usedIds.has(p._id));
  });

  trendingPosts = computed(() => {
    const start = this.trendingPage() * PAGE_SIZE;
    return this.trendingPool().slice(start, start + PAGE_SIZE);
  });

  hotPosts = computed(() => {
    const start = this.hotPage() * PAGE_SIZE;
    return this.hotPool().slice(start, start + PAGE_SIZE);
  });

  latestPosts = computed(() => {
    const start = this.latestPage() * PAGE_SIZE;
    return this.latestPool().slice(start, start + PAGE_SIZE);
  });

  trendingPageCount = computed(() => Math.ceil(this.trendingPool().length / PAGE_SIZE));
  hotPageCount      = computed(() => Math.ceil(this.hotPool().length / PAGE_SIZE));
  latestPageCount   = computed(() => Math.ceil(this.latestPool().length / PAGE_SIZE));

  filteredPosts = computed(() => {
    const cat  = this.selectedCategory();
    const q    = this.searchQuery().trim().toLowerCase();
    const sort = this.selectedSort();

    let posts = this.postsWithTs();
    if (cat) posts = posts.filter(p => p.categories.includes(cat));
    if (q)   posts = posts.filter(p =>
      p.title.toLowerCase().includes(q) ||
      p.description.toLowerCase().includes(q)
    );

    switch (sort) {
      case 'liked':    return [...posts].sort((a, b) => b.likesCount - a.likesCount);
      case 'viewed':   return [...posts].sort((a, b) => b.views - a.views);
      case 'comments': return [...posts].sort((a, b) => b.commentsCount - a.commentsCount);
      default:         return [...posts].sort((a, b) => b._ts - a._ts);
    }
  });

  categoryCounts = computed((): Record<string, number> => {
    const counts: Record<string, number> = {};
    for (const post of this.allPosts()) {
      for (const cat of post.categories) {
        counts[cat] = (counts[cat] ?? 0) + 1;
      }
    }
    return counts;
  });

  isFiltering = computed(() =>
    !!this.selectedCategory() ||
    !!this.searchQuery().trim() ||
    this.selectedSort() !== 'newest'
  );

  isDrawerPostOwner = computed(() => {
    const postId = this.commentDrawerPostId();
    const userId = this.currentUserData()?._id;
    if (!postId || !userId) return false;

    const post = this.allPosts().find(p => p._id === postId);
    if (!post) return false;

    const postOwnerId = (post.user as any)?._id ?? (post.user as any);
    return postOwnerId?.toString() === userId.toString();
  });

  categories: string[] = [
    'Entertainment', 'Health', 'Technology', 'Business',
    'Lifestyle', 'Education', 'Exercise', 'Cooking',
    'Social', 'Quotes', 'Village',
  ];

  categoryEmojis: Record<string, string> = {
    Village: '🌾', Technology: '💻', Health: '🏥',
    Education: '🎓', Business: '💼', Entertainment: '🎬',
    Lifestyle: '🌿', Social: '🤝',
  };

  ngOnInit(): void {
    this.standalone = this.route.snapshot.data['standalone'] ?? this.standalone;

    this.visitorService.trackVisit(window?.location.pathname);

    this.router.events
      .pipe(filter((event: any): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe(event => this.visitorService.trackVisit(event.urlAfterRedirects));

    this.loadPosts();
    this.restoreLikedIds();
    this.fetchCurrentUser();

    this.searchInput$.pipe(
      debounceTime(350),
      distinctUntilChanged(),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe(val => this.searchQuery.set(val));
  }

  onSearchInput(value: string): void {
    this.searchInput$.next(value);
  }

  loadPosts(): void {
    this.postService.getAllPost(1, 100).pipe(
      takeUntilDestroyed(this.destroyRef),
      finalize(() => this.isLoading.set(false))
    ).subscribe({
      next: (res) => {
        const published = (res.data ?? []).filter((p: Post) => p.status === 'published');
        this.allPosts.set(published);
      },
      error: (err) => console.error(err?.error?.message),
    });
  }

  private fetchCurrentUser(): void {
    const userId = this.auth.userId();
    if (!userId) return;

    this.userService.getUserById(userId).pipe(
      takeUntilDestroyed(this.destroyRef)
    ).subscribe({
      next: (res) => this.currentUserData.set(res.data ?? null),
      error: ()    => this.currentUserData.set(null),
    });
  }

  getCatCount(cat: string): number {
    return this.categoryCounts()[cat] ?? 0;
  }

  prevPage(page: WritableSignal<number>): void {
    if (page() > 0) page.set(page() - 1);
  }

  nextPage(page: WritableSignal<number>, total: number): void {
    if (page() < total - 1) page.set(page() + 1);
  }

  readBlog(id: string): void {
    const post = this.allPosts().find(p => p._id === id);
    if (post) this.addView(post);
    this.selectedId.set(id);
    this.isViewed.set(true);
  }

  addView(post: Post): void {
    const key = `viewed_${post._id}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, '1');
    this.patchPost(post._id, { views: post.views + 1 });
    this.postService.addView(post._id).subscribe();
  }

  private restoreLikedIds(): void {
    try {
      const stored = localStorage.getItem('apna_liked_posts');
      if (stored) this.likedPostIds.set(new Set(JSON.parse(stored)));
    } catch { }
  }

  private persistLikedIds(ids: Set<string>): void {
    try {
      localStorage.setItem('apna_liked_posts', JSON.stringify([...ids]));
    } catch { }
  }

  isLiked(postId: string): boolean {
    return this.likedPostIds().has(postId);
  }

  toggleLike(post: Post, event: Event): void {
    event.stopPropagation();
    const liked  = this.isLiked(post._id);
    const newSet = new Set(this.likedPostIds());

    if (liked) {
      newSet.delete(post._id);
      this.likedPostIds.set(newSet);
      this.persistLikedIds(newSet);
      this.patchPost(post._id, { likesCount: Math.max(0, post.likesCount - 1) });
    } else {
      newSet.add(post._id);
      this.likedPostIds.set(newSet);
      this.persistLikedIds(newSet);
      this.patchPost(post._id, { likesCount: post.likesCount + 1 });
      this.postService.likePost(post._id).subscribe({
        error: () => {
          newSet.delete(post._id);
          this.likedPostIds.set(new Set(newSet));
          this.persistLikedIds(newSet);
          this.patchPost(post._id, { likesCount: post.likesCount });
        },
      });
    }
  }

  openCommentDrawer(post: Post, event: Event): void {
    event.stopPropagation();
    this.commentText.set('');
    this.commentFeedback.set(null);
    this.commentDrawerPostId.set(post._id);
    this.loadComments(post._id);
  }

  closeCommentDrawer(): void {
    this.commentDrawerPostId.set(null);
    this.commentText.set('');
    this.commentFeedback.set(null);
    this.drawerComments.set([]);
  }

  private loadComments(postId: string): void {
    this.drawerCommentsLoading.set(true);
    this.postService.getComments(postId).subscribe({
      next: (res: any) => {
        this.drawerComments.set(res.comments ?? []);
        this.drawerCommentsLoading.set(false);
      },
      error: () => this.drawerCommentsLoading.set(false),
    });
  }

  get currentUser(): User | null {
    return this.currentUserData();
  }

  get isLoggedIn(): boolean {
    return this.auth.isAuthorized() && !!this.currentUserData();
  }

  get loggedInUserName(): string {
    return this.currentUserData()?.name ?? 'Anonymous';
  }

  submitComment(): void {
    const text = this.commentText().trim();
    if (!text) {
      this.commentFeedback.set({ type: 'error', msg: 'Please write something before posting.' });
      return;
    }
    if (this.commentSubmitting()) return;

    const postId = this.commentDrawerPostId();
    if (!postId) return;

    this.commentSubmitting.set(true);
    this.commentFeedback.set(null);

    const userId: string | undefined = this.currentUserData()?._id ?? undefined;

    this.postService.commentPost(postId, text, userId).subscribe({
      next: (res: any) => {
        this.commentSubmitting.set(false);
        this.commentText.set('');
        this.commentFeedback.set({ type: 'success', msg: 'Comment posted!' });

        const newComment: DrawerComment = {
          _id:       res.data?.comment?._id,
          name:      this.currentUserData()?.name ?? 'Anonymous',
          comment:   text,
          user:      this.currentUserData()?._id ?? null,
          createdAt: new Date().toISOString(),
        };
        this.drawerComments.set([newComment, ...this.drawerComments()]);

        const post = this.allPosts().find(p => p._id === postId);
        if (post) this.patchPost(postId, { commentsCount: post.commentsCount + 1 });

        setTimeout(() => this.commentFeedback.set(null), 3000);
      },
      error: (err: any) => {
        this.commentSubmitting.set(false);
        this.commentFeedback.set({
          type: 'error',
          msg: err?.error?.message ?? 'Failed to post comment.',
        });
      },
    });
  }

  deleteComment(comment: DrawerComment, event: Event): void {
    event.stopPropagation();

    const postId    = this.commentDrawerPostId();
    const commentId = comment._id;

    if (!postId || !commentId) return;
    if (this.deletingCommentId()) return; 

    this.deletingCommentId.set(commentId);

    this.postService.deleteComment(postId, commentId).subscribe({
      next: () => {

        this.drawerComments.set(
          this.drawerComments().filter(c => c._id !== commentId)
        );

        const post = this.allPosts().find(p => p._id === postId);
        if (post) {
          this.patchPost(postId, { commentsCount: Math.max(0, post.commentsCount - 1) });
        }

        this.deletingCommentId.set(null);
      },
      error: (err: any) => {
        console.error('Delete comment failed:', err?.error?.message);
        this.deletingCommentId.set(null);
      },
    });
  }

  private patchPost(postId: string, updates: Partial<Post>): void {
    this.allPosts.set(
      this.allPosts().map(p => p._id === postId ? { ...p, ...updates } : p)
    );
  }
}