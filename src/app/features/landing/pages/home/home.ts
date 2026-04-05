import {
  Component, inject, signal, computed, OnInit, DestroyRef,
  Input, ChangeDetectionStrategy, WritableSignal, PLATFORM_ID,
  HostListener, ElementRef, ViewChild
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CommonModule, isPlatformBrowser, NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { finalize, debounceTime, distinctUntilChanged } from 'rxjs/operators';
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

interface DrawerComment {
  _id?: string;
  name: string;
  comment: string;
  user: string | null;
  createdAt: string;
}

const PAGE_SIZE = 8;

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
  private platformId     = inject(PLATFORM_ID);

  @Input() standalone = true;
  @ViewChild('searchInput') searchInputEl?: ElementRef<HTMLInputElement>;

  // ── Core state ───────────────────────────────────────────────
  allPosts         = signal<Post[]>([]);
  isLoading        = signal(true);
  isViewed         = signal(false);
  selectedId       = signal('');
  menuOpen: WritableSignal<boolean> = signal(false);
  searchQuery      = signal('');
  selectedCategory = signal('');
  selectedSort     = signal('newest');
  showScrollTop    = signal(false);

  // ── Pagination ───────────────────────────────────────────────
  trendingPage = signal(0);
  hotPage      = signal(0);
  latestPage   = signal(0);

  // ── Likes / Bookmarks ────────────────────────────────────────
  likedPostIds      = signal<Set<string>>(new Set());
  bookmarkedPostIds = signal<Set<string>>(new Set());

  // ── Comments ─────────────────────────────────────────────────
  commentDrawerPostId   = signal<string | null>(null);
  commentText           = signal('');
  commentSubmitting     = signal(false);
  commentFeedback       = signal<{ type: 'success' | 'error'; msg: string } | null>(null);
  drawerComments        = signal<DrawerComment[]>([]);
  drawerCommentsLoading = signal(false);
  deletingCommentId     = signal<string | null>(null);

  private currentUserData = signal<User | null>(null);
  private searchInput$    = new Subject<string>();

  // ── Skeleton ─────────────────────────────────────────────────
  readonly skeletonItems: null[] = new Array(8).fill(null);

  // ── Static data ───────────────────────────────────────────────
  readonly categories: string[] = [
    'Entertainment', 'Health', 'Technology', 'Business',
    'Lifestyle', 'Education', 'Exercise', 'Cooking',
    'Social', 'Quotes', 'Village',
  ];

  readonly categoryEmojis: Record<string, string> = {
    Entertainment: '🎬', Health: '🏥', Technology: '💻', Business: '💼',
    Lifestyle: '🌿', Education: '🎓', Exercise: '🏋️', Cooking: '🍳',
    Social: '🤝', Quotes: '💬', Village: '🌾',
  };

  // ── Computed: base sorted pools ──────────────────────────────
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

  // ── Computed: paginated sections ─────────────────────────────
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

  trendingPageCount = computed(() => Math.max(1, Math.ceil(this.trendingPool().length / PAGE_SIZE)));
  hotPageCount      = computed(() => Math.max(1, Math.ceil(this.hotPool().length / PAGE_SIZE)));
  latestPageCount   = computed(() => Math.max(1, Math.ceil(this.latestPool().length / PAGE_SIZE)));

  // ── Computed: filters ────────────────────────────────────────
  filteredPosts = computed(() => {
    const cat  = this.selectedCategory();
    const q    = this.searchQuery().trim().toLowerCase();
    const sort = this.selectedSort();

    let posts = this.postsWithTs();
    if (cat) posts = posts.filter(p => p.categories.includes(cat));
    if (q)   posts = posts.filter(p =>
      p.title.toLowerCase().includes(q) || p.description.toLowerCase().includes(q)
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
    !!this.selectedCategory() || !!this.searchQuery().trim() || this.selectedSort() !== 'newest'
  );

  totalViews = computed(() =>
    this.allPosts().reduce((sum, p) => sum + (p.views ?? 0), 0)
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

  // ── Keyboard shortcuts ───────────────────────────────────────
  @HostListener('document:keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    const tag = (event.target as Element).tagName;
    if (event.key === '/' && !['INPUT', 'TEXTAREA'].includes(tag)) {
      event.preventDefault();
      this.searchInputEl?.nativeElement?.focus();
    }
    if (event.key === 'Escape') {
      if (this.commentDrawerPostId()) this.closeCommentDrawer();
      if (this.menuOpen()) this.menuOpen.set(false);
    }
  }

  @HostListener('window:scroll')
  onScroll(): void {
    if (isPlatformBrowser(this.platformId)) {
      this.showScrollTop.set(window.scrollY > 500);
    }
  }

  // ── Lifecycle ─────────────────────────────────────────────────
  ngOnInit(): void {
    this.standalone = this.route.snapshot.data['standalone'] ?? this.standalone;

    if (isPlatformBrowser(this.platformId)) {
      const normalisedPath = window.location.pathname.replace(/\/$/, '') || '/';
      if (normalisedPath === '/welcome') {
        this.visitorService.trackVisit('/welcome');
      }
    }

    // Sync category from query param — used by blog-detail's filterByTag()
    this.route.queryParamMap.pipe(
      takeUntilDestroyed(this.destroyRef)
    ).subscribe(params => {
      const cat = params.get('category');
      if (cat) this.selectedCategory.set(cat);
    });

    this.loadPosts();
    this.restoreLikedIds();
    this.restoreBookmarkedIds();
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

  // ── Helpers ───────────────────────────────────────────────────
  isNew(post: Post): boolean {
    return (Date.now() - new Date(post.createdAt).getTime()) < 48 * 60 * 60 * 1000;
  }

  getReadingTime(post: Post): number {
    const text = (post as any).content?.replace(/<[^>]*>/g, '') ?? post.description ?? '';
    return Math.max(1, Math.ceil(text.trim().split(/\s+/).length / 200));
  }

  getCatCount(cat: string): number {
    return this.categoryCounts()[cat] ?? 0;
  }

  formatCount(n: number): string {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
    if (n >= 1_000)     return (n / 1_000).toFixed(1) + 'K';
    return n.toString();
  }

  // ── Pagination ────────────────────────────────────────────────
  prevPage(page: WritableSignal<number>): void {
    if (page() > 0) page.set(page() - 1);
  }

  nextPage(page: WritableSignal<number>, total: number): void {
    if (page() < total - 1) page.set(page() + 1);
  }

  // ── Navigation ────────────────────────────────────────────────
  readBlog(id: string): void {
    this.router.navigate(['/welcome/blog', id]);
  }

  scrollToTop(): void {
    if (isPlatformBrowser(this.platformId)) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  addView(post: Post): void {
    const key = `viewed_${post._id}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, '1');
    this.patchPost(post._id, { views: post.views + 1 });
    this.postService.addView(post._id).subscribe();
  }

  // ── Likes ─────────────────────────────────────────────────────
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

  // ── Bookmarks ─────────────────────────────────────────────────
  private restoreBookmarkedIds(): void {
    try {
      const stored = localStorage.getItem('apna_bookmarked_posts');
      if (stored) this.bookmarkedPostIds.set(new Set(JSON.parse(stored)));
    } catch { }
  }

  private persistBookmarkedIds(ids: Set<string>): void {
    try {
      localStorage.setItem('apna_bookmarked_posts', JSON.stringify([...ids]));
    } catch { }
  }

  isBookmarked(postId: string): boolean {
    return this.bookmarkedPostIds().has(postId);
  }

  toggleBookmark(postId: string, event: Event): void {
    event.stopPropagation();
    const newSet = new Set(this.bookmarkedPostIds());
    if (newSet.has(postId)) newSet.delete(postId);
    else newSet.add(postId);
    this.bookmarkedPostIds.set(newSet);
    this.persistBookmarkedIds(newSet);
  }

  // ── Comments ──────────────────────────────────────────────────
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

  get currentUser(): User | null { return this.currentUserData(); }
  get isLoggedIn(): boolean { return this.auth.isAuthorized() && !!this.currentUserData(); }
  get loggedInUserName(): string { return this.currentUserData()?.name ?? 'Anonymous'; }

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
        this.drawerComments.set(this.drawerComments().filter(c => c._id !== commentId));
        const post = this.allPosts().find(p => p._id === postId);
        if (post) this.patchPost(postId, { commentsCount: Math.max(0, post.commentsCount - 1) });
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