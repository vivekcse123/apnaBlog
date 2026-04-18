import {
  Component, inject, signal, computed, OnInit, OnDestroy, DestroyRef,
  Input, ChangeDetectionStrategy, WritableSignal, PLATFORM_ID,
  HostListener, ElementRef, ViewChild
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CommonModule, isPlatformBrowser, NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Meta, Title } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { forkJoin, of, Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, catchError } from 'rxjs/operators';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { PostService } from '../../../post/services/post-service';
import { Post } from '../../../../core/models/post.model';
import { ReadBlog } from '../read-blog/read-blog';
import { ThemeService } from '../../../../core/services/theme-service';
import { Auth } from '../../../../core/services/auth';
import { UserService } from '../../../user/services/user-service';
import { User } from '../../../user/models/user.mode';
import { VisitorService } from '../../../../core/services/visitor';
import { WelcomeModal } from '../welcome.modal';
import { FormatCountPipe } from '../../../../shared/pipes/format-count-pipe';
import { PostCache } from '../../../post/services/post-cache';

interface DrawerComment {
  _id?: string;
  name: string;
  comment: string;
  user: string | null;
  createdAt: string;
}

interface PostWithTs extends Post { _ts: number; }

const PAGE_SIZE         = 8;
const COMMENT_PAGE_SIZE = 5;

/**
 * How many posts to fetch per HTTP request.
 * Must be ≤ the backend's limit cap (raise cap to 100 in post.router.js —
 * see comment in loadFresh below).
 */
const FETCH_LIMIT = 100;

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [RouterLink, CommonModule, FormsModule, ReadBlog, NgTemplateOutlet, WelcomeModal, FormatCountPipe],
  templateUrl: './home.html',
  styleUrl: './home.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Home implements OnInit, OnDestroy {
  private postService    = inject(PostService);
  private postCache      = inject(PostCache);
  private destroyRef     = inject(DestroyRef);
  private route          = inject(ActivatedRoute);
  private router         = inject(Router);
  private auth           = inject(Auth);
  private userService    = inject(UserService);
  themeService           = inject(ThemeService);
  private visitorService = inject(VisitorService);
  private platformId     = inject(PLATFORM_ID);
  private meta           = inject(Meta);
  private titleService   = inject(Title);
  private document       = inject(DOCUMENT);

  @Input() standalone = true;
  @ViewChild('searchInput') searchInputEl?: ElementRef<HTMLInputElement>;

  allPosts         = signal<PostWithTs[]>([]);
  isLoading        = signal(true);
  isViewed         = signal(false);
  selectedId       = signal('');
  menuOpen: WritableSignal<boolean> = signal(false);
  searchQuery      = signal('');
  selectedCategory = signal('');
  selectedSort     = signal('newest');
  showScrollTop    = signal(false);

  showWelcomeModal  = signal(false);
  private welcomeTimerId: ReturnType<typeof setTimeout> | null = null;

  trendingPage = signal(0);
  hotPage      = signal(0);
  latestPage   = signal(0);

  likedPostIds      = signal<Set<string>>(new Set());
  bookmarkedPostIds = signal<Set<string>>(new Set());

  commentDrawerPostId   = signal<string | null>(null);
  commentText           = signal('');
  commentSubmitting     = signal(false);
  commentFeedback       = signal<{ type: 'success' | 'error'; msg: string } | null>(null);

  drawerComments        = signal<DrawerComment[]>([]);
  drawerCommentsLoading = signal(false);
  loadingMoreComments   = signal(false);
  totalCommentsCount    = signal(0);
  commentFetchedCount   = signal(0);
  deletingCommentId     = signal<string | null>(null);

  private currentUserData = signal<User | null>(null);
  private searchInput$    = new Subject<string>();

  readonly skeletonItems: null[] = new Array(8).fill(null);

  readonly categories: string[] = [
    'Sports', 'Entertainment', 'Health', 'Technology', 'Business',
    'Lifestyle', 'Education', 'Exercise', 'Cooking',
    'Social', 'Quotes', 'Village',
  ];

  readonly categoryEmojis: Record<string, string> = {
    Sports: '🏏', Entertainment: '🎬', Health: '🏥', Technology: '💻', Business: '💼',
    Lifestyle: '🌿', Education: '🎓', Exercise: '🏋️', Cooking: '🍳',
    Social: '🤝', Quotes: '💬', Village: '🌾',
  };

  private readingTimeCache = new Map<string, number>();

  // ── Sorted pools ──────────────────────────────────────────────────────────
  private byLikes = computed(() =>
    [...this.allPosts()].sort((a, b) => b.likesCount - a.likesCount)
  );
  private byViews = computed(() =>
    [...this.allPosts()].sort((a, b) => b.views - a.views)
  );
  private byDate = computed(() =>
    [...this.allPosts()].sort((a, b) => b._ts - a._ts)
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

  trendingPageCount = computed(() => Math.max(1, Math.ceil(this.trendingPool().length / PAGE_SIZE)));
  hotPageCount      = computed(() => Math.max(1, Math.ceil(this.hotPool().length / PAGE_SIZE)));
  latestPageCount   = computed(() => Math.max(1, Math.ceil(this.latestPool().length / PAGE_SIZE)));

  filteredPosts = computed(() => {
    const cat  = this.selectedCategory();
    const q    = this.searchQuery().trim().toLowerCase();
    const sort = this.selectedSort();
    let posts: PostWithTs[] = this.allPosts();

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

  hasMoreComments = computed(() =>
    this.commentFetchedCount() < this.totalCommentsCount()
  );

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
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
      if (this.showWelcomeModal()) this.dismissWelcomeModal();
    }
  }

  @HostListener('window:scroll')
  onScroll(): void {
    if (isPlatformBrowser(this.platformId)) {
      this.showScrollTop.set(window.scrollY > 500);
    }
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  ngOnInit(): void {
    this.standalone = this.route.snapshot.data['standalone'] ?? this.standalone;
    this.setMetaTags();
    this.injectJsonLd();

    this.restoreLikedIds();
    this.restoreBookmarkedIds();

    if (isPlatformBrowser(this.platformId)) {
      const normalisedPath = window.location.pathname.replace(/\/$/, '') || '/';
      if (normalisedPath === '/welcome') {
        this.visitorService.trackVisit('/welcome');
      }
      const alreadySeen = sessionStorage.getItem('apna_welcome_seen');
      if (!alreadySeen) {
        const delay = 2000 + Math.random() * 1000;
        this.welcomeTimerId = setTimeout(() => this.showWelcomeModal.set(true), delay);
      }
    }

    this.route.queryParamMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(params => {
        const cat = params.get('category');
        if (cat) this.selectedCategory.set(cat);
      });

    this.searchInput$.pipe(
      debounceTime(350),
      distinctUntilChanged(),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe(val => this.searchQuery.set(val));

    this.loadInitialData();
  }

  ngOnDestroy(): void {
    if (this.welcomeTimerId !== null) {
      clearTimeout(this.welcomeTimerId);
      this.welcomeTimerId = null;
    }
    this.readingTimeCache.clear();
    const scripts = this.document.querySelectorAll('script[data-apna-home-schema]');
    scripts.forEach(s => s.remove());
  }

  // ── Core loading ──────────────────────────────────────────────────────────

  private readonly STALE_THRESHOLD_MS = 60_000;

  private loadInitialData(): void {
    const cached = this.postCache.get();

    if (cached?.length) {
      this.allPosts.set(cached);
      this.isLoading.set(false);

      const age = this.postCache.getAge();
      if (age === null || age > this.STALE_THRESHOLD_MS) {
        this.loadFresh(false);
      }
    } else {
      this.loadFresh(true);
    }

    this.fetchCurrentUser();
  }

  /**
   * ── Fetch ALL published posts, no matter how many exist ──────────────────
   *
   * IMPORTANT — also make this one-line change in post.router.js:
   *   const limit = Math.max(1, Math.min(parseInt(req.query.limit) || 10, 100));
   *                                                                        ^^^
   *   Change 50 → 100  so FETCH_LIMIT=100 actually works server-side.
   *
   * How it works:
   *   Step 1 — Fetch page 1. The response includes `totalPages`.
   *   Step 2 — If totalPages > 1, fire all remaining pages in parallel (forkJoin).
   *   Step 3 — Merge all batches, filter to published, commit to signal.
   *
   * With 64 posts and FETCH_LIMIT=100 → only 1 HTTP request is needed (fits
   * in a single page). If posts grow to 250 → 3 parallel requests. Automatic.
   */
  private loadFresh(showLoader: boolean): void {
    if (showLoader) this.isLoading.set(true);

    this.postService.getAllPost(1, FETCH_LIMIT)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        catchError(err => {
          console.error('[Home] page 1 failed:', err);
          this.isLoading.set(false);
          return of(null);
        })
      )
      .subscribe(firstRes => {
        if (!firstRes) return;

        const firstBatch: Post[] = firstRes.data       ?? [];
        const totalPages: number = firstRes.totalPages ?? 1;

        // ── All posts fit in one page — done ────────────────────────────────
        if (totalPages <= 1) {
          this.commitPosts(firstBatch);
          this.isLoading.set(false);
          return;
        }

        // ── More pages exist — fetch them all in parallel ───────────────────
        const pageNums = Array.from({ length: totalPages - 1 }, (_, i) => i + 2);

        forkJoin(
          pageNums.map(page =>
            this.postService.getAllPost(page, FETCH_LIMIT).pipe(
              catchError(err => {
                console.error(`[Home] page ${page} failed:`, err);
                // Return empty shell — forkJoin won't abort on one failed page
                return of({
                  data: [] as Post[],
                  totalPages,
                  total: 0,
                  page,
                  limit: FETCH_LIMIT,
                  status: 200,
                  message: '',
                });
              })
            )
          )
        )
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe(restResponses => {
          const allRaw: Post[] = [
            ...firstBatch,
            ...restResponses.flatMap(r => r.data ?? []),
          ];
          this.commitPosts(allRaw);
          this.isLoading.set(false);
        });
      });
  }

  /**
   * Dedup by _id, filter to published + legacy-draft, stamp _ts, write to signal + cache.
   * 'draft' = posts created before the pending-review workflow; they must remain visible.
   */
  private commitPosts(raw: Post[]): void {
    const seen    = new Set<string>();
    const visible: PostWithTs[] = [];

    for (const p of raw) {
      if (p.status !== 'published' && p.status !== 'draft') continue;
      if (seen.has(p._id)) continue;   // guard against duplicate pages
      seen.add(p._id);
      visible.push({ ...p, _ts: new Date(p.createdAt).getTime() });
    }

    this.allPosts.set(visible);
    this.postCache.set(visible);
    this.updateJsonLdPostCount(visible.length);
  }

  private fetchCurrentUser(): void {
    const userId = this.auth.userId();
    if (!userId) return;

    this.userService.getUserById(userId)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        catchError(() => of({ data: null }))
      )
      .subscribe(res => this.currentUserData.set(res.data ?? null));
  }

  // ── Meta / SEO ────────────────────────────────────────────────────────────

  private setMetaTags(): void {
    this.titleService.setTitle('ApnaInsights — Community Stories from Every Corner of India');
    this.meta.updateTag({ name: 'description',    content: 'Discover real stories from real people across India. Read and write blogs on Technology, Lifestyle, Health, Business, Education, Village Life and more. Free community blogging platform — join thousands of Indian writers.' });
    this.meta.updateTag({ name: 'keywords',       content: 'Indian blog platform, community stories India, read blogs India, write blogs free, trending stories, technology blog India, village life stories, health stories India, ApnaInsights' });
    this.meta.updateTag({ name: 'robots',         content: 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1' });
    this.meta.updateTag({ name: 'author',         content: 'ApnaInsights Community' });
    this.meta.updateTag({ property: 'og:type',         content: 'website' });
    this.meta.updateTag({ property: 'og:title',        content: 'ApnaInsights — Community Stories from Every Corner of India' });
    this.meta.updateTag({ property: 'og:description',  content: 'Discover real stories from real people across India. 10K+ blogs on Technology, Lifestyle, Health, Business, Village Life and more. Free to read, free to write.' });
    this.meta.updateTag({ property: 'og:url',          content: 'https://apnainsights.com' });
    this.meta.updateTag({ property: 'og:site_name',    content: 'ApnaInsights' });
    this.meta.updateTag({ property: 'og:image',        content: 'https://apnainsights.com/logo.png' });
    this.meta.updateTag({ property: 'og:image:width',  content: '1024' });
    this.meta.updateTag({ property: 'og:image:height', content: '1024' });
    this.meta.updateTag({ property: 'og:image:alt',    content: 'ApnaInsights — Community Stories from Every Corner of India' });
    this.meta.updateTag({ property: 'og:locale',       content: 'en_IN' });
    this.meta.updateTag({ name: 'twitter:card',        content: 'summary_large_image' });
    this.meta.updateTag({ name: 'twitter:title',       content: 'ApnaInsights — Community Stories from India' });
    this.meta.updateTag({ name: 'twitter:description', content: 'Real stories from real people. 10K+ blogs on technology, lifestyle, health, village life. Free community platform.' });
    this.meta.updateTag({ name: 'twitter:image',       content: 'https://apnainsights.com/logo.png' });
    this.meta.updateTag({ name: 'twitter:site',        content: '@apnainsights' });

    let canonical = this.document.querySelector('link[rel="canonical"]') as HTMLLinkElement;
    if (!canonical) {
      canonical = this.document.createElement('link');
      canonical.setAttribute('rel', 'canonical');
      this.document.head.appendChild(canonical);
    }
    canonical.setAttribute('href', 'https://apnainsights.com');
  }

  private injectJsonLd(): void {
    if (this.document.querySelector('script[data-apna-home-schema]')) return;

    const schemas = [
      {
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        '@id': 'https://apnainsights.com',
        url: 'https://apnainsights.com',
        name: 'ApnaInsights — Community Stories from Every Corner of India',
        description: 'Browse trending, most-viewed, and latest community blogs from writers across India.',
        inLanguage: 'en-IN',
        isPartOf: { '@type': 'WebSite', url: 'https://apnainsights.com' },
        about: { '@type': 'Thing', name: 'Community Blogging India' },
        breadcrumb: {
          '@type': 'BreadcrumbList',
          itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Home', item: 'https://apnainsights.com' }]
        }
      }
    ];

    schemas.forEach((schema, i) => {
      const script = this.document.createElement('script');
      script.type = 'application/ld+json';
      script.setAttribute('data-apna-home-schema', String(i));
      script.textContent = JSON.stringify(schema);
      this.document.head.appendChild(script);
    });
  }

  private updateJsonLdPostCount(count: number): void {
    const script = this.document.querySelector('script[data-apna-home-schema="0"]');
    if (!script) return;
    try {
      const data = JSON.parse(script.textContent ?? '{}');
      data.numberOfItems = count;
      script.textContent = JSON.stringify(data);
    } catch { /* non-critical */ }
  }

  // ── Welcome modal ─────────────────────────────────────────────────────────

  dismissWelcomeModal(): void {
    this.showWelcomeModal.set(false);
    if (isPlatformBrowser(this.platformId)) {
      sessionStorage.setItem('apna_welcome_seen', '1');
    }
  }

  // ── Search ────────────────────────────────────────────────────────────────

  onSearchInput(value: string): void {
    this.searchInput$.next(value);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  isNew(post: Post): boolean {
    return (Date.now() - new Date(post.createdAt).getTime()) < 48 * 60 * 60 * 1000;
  }

  getReadingTime(post: Post): number {
    if (this.readingTimeCache.has(post._id)) return this.readingTimeCache.get(post._id)!;
    const text = (post as any).content?.replace(/<[^>]*>/g, '') ?? post.description ?? '';
    const time = Math.max(1, Math.ceil(text.trim().split(/\s+/).length / 200));
    this.readingTimeCache.set(post._id, time);
    return time;
  }

  getCatCount(cat: string): number { return this.categoryCounts()[cat] ?? 0; }

  selectCategory(cat: string): void {
    const next = this.selectedCategory() === cat ? '' : cat;
    this.selectedCategory.set(next);
    if (isPlatformBrowser(this.platformId)) {
      setTimeout(() => {
        const el = this.document.querySelector('.filter-wrap') as HTMLElement | null;
        el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 60);
    }
  }

  prevPage(page: WritableSignal<number>): void {
    if (page() > 0) page.set(page() - 1);
  }
  nextPage(page: WritableSignal<number>, total: number): void {
    if (page() < total - 1) page.set(page() + 1);
  }

  readBlog(id: string): void { this.router.navigate(['/blog', id]); }

  scrollToTop(): void {
    if (isPlatformBrowser(this.platformId)) window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  addView(post: Post): void {
    const key = `viewed_${post._id}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, '1');
    this.patchPost(post._id, { views: post.views + 1 });
    this.postService.addView(post._id).subscribe();
  }

  // ── Likes ─────────────────────────────────────────────────────────────────

  private restoreLikedIds(): void {
    try {
      const stored = localStorage.getItem('apna_liked_posts');
      if (stored) this.likedPostIds.set(new Set(JSON.parse(stored)));
    } catch { }
  }

  private persistLikedIds(ids: Set<string>): void {
    try { localStorage.setItem('apna_liked_posts', JSON.stringify([...ids])); } catch { }
  }

  isLiked(postId: string): boolean { return this.likedPostIds().has(postId); }

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

  // ── Bookmarks ─────────────────────────────────────────────────────────────

  private restoreBookmarkedIds(): void {
    try {
      const stored = localStorage.getItem('apna_bookmarked_posts');
      if (stored) this.bookmarkedPostIds.set(new Set(JSON.parse(stored)));
    } catch { }
  }

  private persistBookmarkedIds(ids: Set<string>): void {
    try { localStorage.setItem('apna_bookmarked_posts', JSON.stringify([...ids])); } catch { }
  }

  isBookmarked(postId: string): boolean { return this.bookmarkedPostIds().has(postId); }

  toggleBookmark(postId: string, event: Event): void {
    event.stopPropagation();
    const newSet = new Set(this.bookmarkedPostIds());
    if (newSet.has(postId)) newSet.delete(postId);
    else newSet.add(postId);
    this.bookmarkedPostIds.set(newSet);
    this.persistBookmarkedIds(newSet);
  }

  // ── Comment drawer ────────────────────────────────────────────────────────

  openCommentDrawer(post: Post, event: Event): void {
    event.stopPropagation();
    this.commentText.set('');
    this.commentFeedback.set(null);
    this.drawerComments.set([]);
    this.commentFetchedCount.set(0);
    this.totalCommentsCount.set(post.commentsCount ?? 0);
    this.commentDrawerPostId.set(post._id);
    this.loadComments(post._id, 0);
  }

  closeCommentDrawer(): void {
    this.commentDrawerPostId.set(null);
    this.commentText.set('');
    this.commentFeedback.set(null);
    this.drawerComments.set([]);
    this.commentFetchedCount.set(0);
    this.totalCommentsCount.set(0);
  }

  private loadComments(postId: string, skip: number): void {
    const isFirst = skip === 0;
    isFirst
      ? this.drawerCommentsLoading.set(true)
      : this.loadingMoreComments.set(true);

    this.postService.getComments(postId, skip, COMMENT_PAGE_SIZE).subscribe({
      next: (res) => {
        const incoming: DrawerComment[] = (res.comments ?? []) as DrawerComment[];

        // ✅ backend returns `totalComments` — not `total` or `totalCount`
        const total: number = res.totalComments ?? incoming.length;

        this.drawerComments.set(
          isFirst ? incoming : [...this.drawerComments(), ...incoming]
        );
        this.commentFetchedCount.set(this.commentFetchedCount() + incoming.length);
        this.totalCommentsCount.set(total);

        isFirst
          ? this.drawerCommentsLoading.set(false)
          : this.loadingMoreComments.set(false);
      },
      error: () => {
        this.drawerCommentsLoading.set(false);
        this.loadingMoreComments.set(false);
      },
    });
  }

  loadMoreComments(): void {
    const postId = this.commentDrawerPostId();
    if (!postId || this.loadingMoreComments() || !this.hasMoreComments()) return;
    this.loadComments(postId, this.commentFetchedCount());
  }

  // ── Auth helpers ──────────────────────────────────────────────────────────

  get currentUser(): User | null { return this.currentUserData(); }
  get isLoggedIn(): boolean      { return this.auth.isAuthorized() && !!this.currentUserData(); }
  get loggedInUserName(): string { return this.currentUserData()?.name ?? 'Anonymous'; }

  // ── Submit comment ────────────────────────────────────────────────────────

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
        this.commentFetchedCount.set(this.commentFetchedCount() + 1);
        this.totalCommentsCount.set(this.totalCommentsCount() + 1);

        const post = this.allPosts().find(p => p._id === postId);
        if (post) this.patchPost(postId, { commentsCount: post.commentsCount + 1 });

        setTimeout(() => this.commentFeedback.set(null), 3000);
      },
      error: (err: any) => {
        this.commentSubmitting.set(false);
        this.commentFeedback.set({
          type: 'error',
          msg:  err?.error?.message ?? 'Failed to post comment.',
        });
      },
    });
  }

  deleteComment(comment: DrawerComment, event: Event): void {
    event.stopPropagation();
    const postId    = this.commentDrawerPostId();
    const commentId = comment._id;
    if (!postId || !commentId || this.deletingCommentId()) return;

    this.deletingCommentId.set(commentId);

    this.postService.deleteComment(postId, commentId).subscribe({
      next: () => {
        this.drawerComments.set(this.drawerComments().filter(c => c._id !== commentId));
        this.commentFetchedCount.set(Math.max(0, this.commentFetchedCount() - 1));
        this.totalCommentsCount.set(Math.max(0, this.totalCommentsCount() - 1));

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

  // ── Utility ───────────────────────────────────────────────────────────────

  private patchPost(postId: string, updates: Partial<Post>): void {
    this.allPosts.set(
      this.allPosts().map(p => p._id === postId ? { ...p, ...updates } : p)
    );
  }

  trackByPostId(_index: number, post: Post): string { return post._id; }
  trackByCategory(_index: number, cat: string): string { return cat; }
}