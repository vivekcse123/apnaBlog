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
import { of, Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, catchError } from 'rxjs/operators';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { PostService } from '../../../post/services/post-service';
import { Post } from '../../../../core/models/post.model';
import { ReadBlog } from '../read-blog/read-blog';
import { ThemeService } from '../../../../core/services/theme-service';
import { Auth } from '../../../../core/services/auth';
import { UserService } from '../../../user/services/user-service';
import { User } from '../../../user/models/user.mode';
import { WelcomeModal } from '../welcome.modal';
import { FormatCountPipe } from '../../../../shared/pipes/format-count-pipe';
import { TimeAgoPipe }     from '../../../../shared/pipes/time-ago-pipe';
import { PostCache, PostWithTs } from '../../../post/services/post-cache';
import { ReadingHistory }        from '../../../../core/services/reading-history';

const PAGE_SIZE   = 8;
const FETCH_LIMIT = 20;   // posts per server page — keeps initial payload small

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [RouterLink, CommonModule, FormsModule, ReadBlog, NgTemplateOutlet, WelcomeModal, FormatCountPipe, TimeAgoPipe],
  templateUrl: './home.html',
  styleUrl: './home.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Home implements OnInit, OnDestroy {
  private postService     = inject(PostService);
  private postCache       = inject(PostCache);
  private readingHistory  = inject(ReadingHistory);
  private destroyRef     = inject(DestroyRef);
  private route          = inject(ActivatedRoute);
  private router         = inject(Router);
  private auth           = inject(Auth);
  private userService    = inject(UserService);
  themeService           = inject(ThemeService);
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
  selectedTag          = signal('');
  selectedReadingTime  = signal<'' | 'quick' | 'medium' | 'long'>('');
  selectedSort         = signal('newest');
  showScrollTop    = signal(false);

  showWelcomeModal  = signal(false);
  private welcomeTimerId: ReturnType<typeof setTimeout> | null = null;

  // Server-side pagination state
  private serverPage       = signal(1);
  private serverTotalPages = signal(1);
  hasMoreOnServer          = signal(false);
  isFetchingMore           = signal(false);

  // Server-reported totals — used for hero stats so they're always accurate
  private serverTotal      = signal(0);
  private serverTotalViews = signal(0);

  trendingPage = signal(0);
  hotPage      = signal(0);
  latestPage   = signal(0);
  filteredPage = signal(0);

  likedPostIds      = signal<Set<string>>(new Set());
  bookmarkedPostIds = signal<Set<string>>(new Set());

  // ── Personalization signals (browser-only — always false/empty on SSR) ──────
  historyLoaded    = signal(false);
  readHistoryIds   = signal<Set<string>>(new Set());
  progressMap      = signal<Map<string, number>>(new Map());
  readingStreak    = signal(0);


  private currentUserData = signal<User | null>(null);
  private searchInput$    = new Subject<string>();

  readonly skeletonItems: null[] = new Array(8).fill(null);

  readonly categories: string[] = [
    'Update', 'News',
    'Sports', 'Entertainment', 'Health', 'Technology', 'Business',
    'Lifestyle', 'Education', 'Exercise', 'Cooking',
    'Social', 'Quotes', 'Village',
  ];

  readonly categoryEmojis: Record<string, string> = {
    Update: '📢', News: '📰',
    Sports: '🏏', Entertainment: '🎬', Health: '🏥', Technology: '💻', Business: '💼',
    Lifestyle: '🌿', Education: '🎓', Exercise: '🏋️', Cooking: '🍳',
    Social: '🤝', Quotes: '💬', Village: '🌾',
  };

  private readingTimeCache = new Map<string, number>();

  private byLikes = computed(() =>
    [...this.allPosts()].sort((a, b) => b.likesCount - a.likesCount)
  );
  private byViews = computed(() =>
    [...this.allPosts()].sort((a, b) => b.views - a.views)
  );
  private byDate = computed(() =>
    [...this.allPosts()].sort((a, b) => b._ts - a._ts)
  );

  trendingPosts = computed(() => {
    const start = this.trendingPage() * PAGE_SIZE;
    return this.byLikes().slice(start, start + PAGE_SIZE);
  });
  hotPosts = computed(() => {
    const start = this.hotPage() * PAGE_SIZE;
    return this.byViews().slice(start, start + PAGE_SIZE);
  });
  latestPosts = computed(() => {
    const start = this.latestPage() * PAGE_SIZE;
    return this.byDate().slice(start, start + PAGE_SIZE);
  });

  trendingPageCount = computed(() => Math.max(1, Math.ceil(this.allPosts().length / PAGE_SIZE)));
  hotPageCount      = computed(() => Math.max(1, Math.ceil(this.allPosts().length / PAGE_SIZE)));
  latestPageCount   = computed(() => Math.max(1, Math.ceil(this.allPosts().length / PAGE_SIZE)));

  filteredPageCount = computed(() => Math.max(1, Math.ceil(this.filteredPosts().length / PAGE_SIZE)));
  visibleFilteredPosts = computed(() => {
    const start = this.filteredPage() * PAGE_SIZE;
    return this.filteredPosts().slice(start, start + PAGE_SIZE);
  });

  filteredPosts = computed(() => {
    const cat  = this.selectedCategory();
    const tag  = this.selectedTag();
    const rt   = this.selectedReadingTime();
    const q    = this.searchQuery().trim().toLowerCase();
    const sort = this.selectedSort();
    let posts: PostWithTs[] = this.allPosts();

    if (cat) posts = posts.filter(p => p.categories.includes(cat));
    if (tag) posts = posts.filter(p => p.tags?.includes(tag));
    if (rt)  posts = posts.filter(p => {
      const mins = this.getReadingTime(p);
      if (rt === 'quick')  return mins <= 4;
      if (rt === 'medium') return mins >= 5 && mins <= 9;
      if (rt === 'long')   return mins >= 10;
      return true;
    });
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
    !!this.selectedCategory() || !!this.selectedTag() || !!this.selectedReadingTime() ||
    !!this.searchQuery().trim() || this.selectedSort() !== 'newest'
  );

  /** Top 15 tags by frequency across all posts. */
  popularTags = computed(() => {
    const counts = new Map<string, number>();
    for (const post of this.allPosts()) {
      for (const tag of (post.tags ?? [])) {
        if (tag) counts.set(tag, (counts.get(tag) ?? 0) + 1);
      }
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([tag]) => tag);
  });

  /** IDs of the top-5 trending posts — used to show the 🔥 badge on cards. */
  private trendingTopIds = computed(() =>
    new Set(this.byLikes().slice(0, 5).map((p: PostWithTs) => p._id))
  );

  isTrending(postId: string): boolean { return this.trendingTopIds().has(postId); }

  publishedCount = computed(() => {
    // 1. API sends an explicit total  ✓
    if (this.serverTotal() > 0) return this.serverTotal();
    // 2. Derive from totalPages × pageSize (slight overcount on last page, still far better than 20)
    const pages = this.serverTotalPages();
    if (pages > 1) return pages * FETCH_LIMIT;
    // 3. Exact count from fully-loaded cache
    return this.allPosts().filter(p => p.status === 'published').length;
  });

  // Topics: count unique categories across ALL defined platform categories.
  // Uses fetched posts as the source of truth; grows as more pages are loaded.
  // Bounded at categories.length (14) so it never shows more than the platform has.
  activeTopicsCount = computed(() => {
    const active = new Set<string>();
    for (const post of this.allPosts()) {
      if (post.status === 'published') {
        for (const cat of post.categories) active.add(cat);
      }
    }
    // If we haven't loaded enough posts to see all categories yet,
    // show the total number of platform categories (all are active on a live blog).
    return active.size < this.categories.length && this.serverTotalPages() > 1
      ? this.categories.length
      : active.size;
  });

  totalViews = computed(() =>
    this.allPosts()
      .filter(p => p.status === 'published')
      .reduce((sum, p) => sum + (p.views ?? 0), 0)
  );

  // True once we've loaded all server pages — stats are then fully accurate
  statsReady = computed(() =>
    !this.hasMoreOnServer() && this.allPosts().length > 0
  );

  isDrawerPostOwner = computed(() => {
    return false;
  });

;

  // ── Personalization computeds ────────────────────────────────────────────────

  /** Posts the user has bookmarked, in bookmark order (newest first). */
  favoritePosts = computed(() => {
    if (!this.historyLoaded()) return [];
    const ids = this.bookmarkedPostIds();
    return this.allPosts().filter(p => ids.has(p._id));
  });

  /** Unread posts that share the user's top-read categories, ranked by engagement. */
  recommendedPosts = computed(() => {
    if (!this.historyLoaded() || this.readHistoryIds().size < 3) return [];
    const topCats = this.readingHistory.getTopCategories(3);
    if (topCats.length === 0) return [];
    const readIds = this.readHistoryIds();
    return [...this.allPosts()]
      .filter(p => !readIds.has(p._id) && p.categories.some(c => topCats.includes(c)))
      .sort((a, b) => (b.views + b.likesCount * 2) - (a.views + a.likesCount * 2))
      .slice(0, 8);
  });

  showFavorites   = computed(() => this.favoritePosts().length > 0);
  showRecommended = computed(() => this.recommendedPosts().length > 0);

  navCatOpen = signal(false);

  get writeRoute(): string { return this.isLoggedIn ? this.dashboardRoute : '/auth/login'; }

  toggleNavCat(): void { this.navCatOpen.set(!this.navCatOpen()); }

  @HostListener('document:click', ['$event'])
  onDocClick(e: MouseEvent): void {
    if (!(e.target as HTMLElement).closest('.nav-cat-wrap')) {
      this.navCatOpen.set(false);
    }
  }

  @HostListener('document:keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    const tag = (event.target as Element).tagName;
    if (event.key === '/' && !['INPUT', 'TEXTAREA'].includes(tag)) {
      event.preventDefault();
      this.searchInputEl?.nativeElement?.focus();
    }
    if (event.key === 'Escape') {
      if (this.menuOpen()) this.menuOpen.set(false);
      if (this.navCatOpen()) this.navCatOpen.set(false);
      if (this.showWelcomeModal()) this.dismissWelcomeModal();
    }
  }

  @HostListener('window:scroll')
  onScroll(): void {
    if (isPlatformBrowser(this.platformId)) {
      this.showScrollTop.set(window.scrollY > 500);
    }
  }

  ngOnInit(): void {
    this.standalone = this.route.snapshot.data['standalone'] ?? this.standalone;
    this.setMetaTags();
    this.injectJsonLd();

    this.restoreLikedIds();
    this.restoreBookmarkedIds();
    this.restoreReadHistory();

    if (isPlatformBrowser(this.platformId)) {
      const alreadySeen = sessionStorage.getItem('apna_welcome_seen');
      if (!alreadySeen) {
        const delay = 2000 + Math.random() * 1000;
        this.welcomeTimerId = setTimeout(() => this.showWelcomeModal.set(true), delay);
      }
    }

    this.route.queryParamMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(params => {
        this.selectedCategory.set(params.get('category') ?? '');
        this.selectedTag.set(params.get('tag') ?? '');
        const rt = params.get('rt') ?? '';
        this.selectedReadingTime.set(['quick','medium','long'].includes(rt) ? rt as any : '');
        const q = params.get('q');
        if (q) {
          this.searchQuery.set(q);
          this.searchInput$.next(q);
          if (this.searchInputEl?.nativeElement) {
            this.searchInputEl.nativeElement.value = q;
          }
        }
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

  private pushHomeAds(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    try {
      const ads: any[] = (window as any).adsbygoogle ?? [];
      (window as any).adsbygoogle = ads;
      const slots = this.document.querySelectorAll('.home-ad-wrap ins.adsbygoogle');
      slots.forEach(() => ads.push({}));
    } catch (_) { }
  }


  private readonly STALE_THRESHOLD_MS = 2 * 60_000;

  private loadInitialData(): void {
    const cached = this.postCache.get();

    if (cached?.length) {
      this.allPosts.set(cached);
      this.isLoading.set(false);
      // Cache has all posts — set page count to 1 so computed stats use allPosts directly
      this.serverTotalPages.set(1);
      this.hasMoreOnServer.set(false);
      

      const age = this.postCache.getAge();
      if (age === null || age > this.STALE_THRESHOLD_MS) {
        this.loadFresh(false);
      }
    } else {
      this.loadFresh(true);
    }

    this.fetchCurrentUser();
  }

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
      .subscribe(res => {
        if (!res) return;
        const posts: Post[]      = res.data || [];
        const totalPages: number = res.totalPages || 1;
        // Try every possible field name the API might use for total count
        const total: number      = res.totalBlogs || res.total || 0;
        const views: number      = res.totalViews  || 0;

        this.serverTotalPages.set(totalPages);
        if (total > 0) this.serverTotal.set(total);
        if (views > 0) this.serverTotalViews.set(views);

        if (showLoader) {
          // Fresh load (no cache) — start with just the first 20
          this.commitPosts(posts);
        } else {
          // Background refresh — merge new posts into existing dataset
          // so cached posts are never lost
          this.commitPosts([...this.allPosts(), ...posts]);
        }
        this.serverPage.set(1);
        this.hasMoreOnServer.set(totalPages > 1);
        this.isLoading.set(false);
        setTimeout(() => this.pushHomeAds(), 300);
      });
  }

  loadNextServerPage(): void {
    if (this.isFetchingMore() || !this.hasMoreOnServer()) return;
    this.isFetchingMore.set(true);
    const nextPage = this.serverPage() + 1;

    this.postService.getAllPost(nextPage, FETCH_LIMIT)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        catchError(err => {
          console.error(`[Home] page ${nextPage} failed:`, err);
          this.isFetchingMore.set(false);
          return of(null);
        })
      )
      .subscribe(res => {
        if (!res) return;
        const newPosts: Post[]   = res.data       || [];
        const totalPages: number = res.totalPages  || nextPage;
        const views: number      = res.totalViews  || 0;

        if (views > 0) this.serverTotalViews.set(views);

        this.commitPosts([...this.allPosts(), ...newPosts]);
        this.serverPage.set(nextPage);
        this.hasMoreOnServer.set(nextPage < totalPages);
        this.isFetchingMore.set(false);

        // Re-attach observer to any new sentinels that appeared
        
      });
  }

  private commitPosts(raw: Post[]): void {
    // Build a map from existing posts so we can merge (not replace) them
    const existing = new Map(this.allPosts().map(p => [p._id, p]));
    const incoming = new Map<string, PostWithTs>();

    for (const p of raw) {
      if (p.status !== 'published' && p.status !== 'draft') continue;
      if (incoming.has(p._id)) continue;
      const prev = existing.get(p._id);
      incoming.set(p._id, {
        ...p,
        _ts:        new Date(p.createdAt).getTime(),
        views:      Math.max(p.views      ?? 0, prev?.views      ?? 0),
        likesCount: Math.max(p.likesCount ?? 0, prev?.likesCount ?? 0),
      });
    }

    // Keep existing posts that weren't in raw (they're still valid)
    for (const [id, p] of existing) {
      if (!incoming.has(id)) incoming.set(id, p);
    }

    const visible = [...incoming.values()];
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

  private setMetaTags(): void {
    this.titleService.setTitle('ApnaInsights — Community Stories from Every Corner of India');
    this.meta.updateTag({ name: 'description',    content: 'Discover real stories from real people across India. Read and write blogs on Technology, Lifestyle, Health, Business, Education, Village Life and more. Free community blogging platform — join thousands of Indian writers.' });
    this.meta.updateTag({ name: 'keywords',       content: 'Indian blog platform, community stories India, read blogs India, write blogs free, trending stories, technology blog India, village life stories, health stories India, ApnaInsights' });
    this.meta.updateTag({ name: 'robots',         content: 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1' });
    this.meta.updateTag({ name: 'author',         content: 'ApnaInsights Community' });
    this.meta.updateTag({ property: 'og:type',         content: 'website' });
    this.meta.updateTag({ property: 'og:title',        content: 'ApnaInsights — Community Stories from Every Corner of India' });
    this.meta.updateTag({ property: 'og:description',  content: 'Discover real stories from real people across India. 10K+ blogs on Technology, Lifestyle, Health, Business, Village Life and more. Free to read, free to write.' });
    this.meta.updateTag({ property: 'og:url',          content: 'https://apnainsights.com/' });
    this.meta.updateTag({ property: 'og:site_name',    content: 'ApnaInsights' });
    this.meta.updateTag({ property: 'og:image',        content: 'https://apnainsights.com/og-image.png' });
    this.meta.updateTag({ property: 'og:image:width',  content: '1200' });
    this.meta.updateTag({ property: 'og:image:height', content: '630' });
    this.meta.updateTag({ property: 'og:image:alt',    content: 'ApnaInsights — Community Stories from Every Corner of India' });
    this.meta.updateTag({ property: 'og:locale',       content: 'en_IN' });
    this.meta.updateTag({ name: 'twitter:card',        content: 'summary_large_image' });
    this.meta.updateTag({ name: 'twitter:title',       content: 'ApnaInsights — Community Stories from India' });
    this.meta.updateTag({ name: 'twitter:description', content: 'Real stories from real people. 10K+ blogs on technology, lifestyle, health, village life. Free community platform.' });
    this.meta.updateTag({ name: 'twitter:image',       content: 'https://apnainsights.com/og-image.png' });
    this.meta.updateTag({ name: 'twitter:site',        content: '@apnainsights' });

    let canonical = this.document.querySelector('link[rel="canonical"]') as HTMLLinkElement;
    if (!canonical) {
      canonical = this.document.createElement('link');
      canonical.setAttribute('rel', 'canonical');
      this.document.head.appendChild(canonical);
    }
    canonical.setAttribute('href', 'https://apnainsights.com/');
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

  dismissWelcomeModal(): void {
    this.showWelcomeModal.set(false);
    if (isPlatformBrowser(this.platformId)) {
      sessionStorage.setItem('apna_welcome_seen', '1');
    }
  }

  onSearchInput(value: string): void {
    this.searchInput$.next(value);
    this.resetVisibleCounts();
  }

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
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: next ? { category: next } : {},
      replaceUrl: true,
    });
    if (!isPlatformBrowser(this.platformId)) return;

    // Double rAF — waits for Angular to render filtered results into DOM
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const filterWrap  = this.document.querySelector('.filter-wrap') as HTMLElement;
        const resultsEl   = this.document.getElementById('results-heading')
                              ?.closest('section') as HTMLElement | null;

        if (next && resultsEl) {
          // Scroll so results appear just below the sticky filter bar
          const filterBottom = filterWrap
            ? filterWrap.getBoundingClientRect().bottom
            : 66;
          const resultsTop = resultsEl.getBoundingClientRect().top + window.scrollY
                             - filterBottom - 12;
          window.scrollTo({ top: Math.max(0, resultsTop), behavior: 'smooth' });
        } else if (filterWrap) {
          // Category cleared — bring filter into view without going to page top
          const filterTop = filterWrap.getBoundingClientRect().top + window.scrollY - 70;
          window.scrollTo({ top: Math.max(0, filterTop), behavior: 'smooth' });
        }
      });
    });
  }

  private resetVisibleCounts(): void {
    this.filteredPage.set(0);
  }

  selectTag(tag: string): void {
    const next = this.selectedTag() === tag ? '' : tag;
    this.selectedTag.set(next);
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: next ? { tag: next } : {},
      replaceUrl: true,
    });
  }

  selectReadingTime(rt: '' | 'quick' | 'medium' | 'long'): void {
    const next = this.selectedReadingTime() === rt ? '' : rt;
    this.selectedReadingTime.set(next);
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: next ? { rt: next } : {},
      replaceUrl: true,
    });
  }

  // Used by <select> elements — sets directly (no toggle)
  onTagSelectChange(tag: string): void {
    this.selectedTag.set(tag);
    this.resetVisibleCounts();
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: tag ? { tag } : {},
      replaceUrl: true,
    });
  }

  onTimeSelectChange(rt: string): void {
    this.selectedReadingTime.set(rt as any);
    this.resetVisibleCounts();
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: rt ? { rt } : {},
      replaceUrl: true,
    });
  }

  prevPage(page: WritableSignal<number>): void {
    if (page() > 0) { page.update(p => p - 1); scrollTo({ top: 0, behavior: 'smooth' }); }
  }

  nextPage(page: WritableSignal<number>, total: number): void {
    if (page() < total - 1) {
      page.update(p => p + 1);
      scrollTo({ top: 0, behavior: 'smooth' });
    }
    // Last page of memory — transparently fetch more from server
    if (page() >= total - 2 && this.hasMoreOnServer()) {
      this.loadNextServerPage();
    }
  }

  readBlog(id: string): void {
    if (isPlatformBrowser(this.platformId)) {
      const post = this.allPosts().find(p => p._id === id || (p as any).slug === id);
      if (post) {
        this.readingHistory.add(post);
        const newIds = new Set(this.readHistoryIds());
        newIds.add(post._id);
        this.readHistoryIds.set(newIds);
      }
    }
    this.router.navigate(['/blog', id]);
  }

  scrollToTop(): void {
    if (isPlatformBrowser(this.platformId)) window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  addView(post: Post): void {
    if (!isPlatformBrowser(this.platformId)) return;
    const key = `viewed_${post._id}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, '1');
    } catch { return; }
    this.patchPost(post._id, { views: post.views + 1 });
    this.postService.addView(post._id).subscribe();
  }

  private restoreLikedIds(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    try {
      const stored = localStorage.getItem('apna_liked_posts');
      if (stored) this.likedPostIds.set(new Set(JSON.parse(stored)));
    } catch { }
  }

  private persistLikedIds(ids: Set<string>): void {
    if (!isPlatformBrowser(this.platformId)) return;
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

  private restoreBookmarkedIds(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    try {
      const stored = localStorage.getItem('apna_bookmarked_posts');
      if (stored) this.bookmarkedPostIds.set(new Set(JSON.parse(stored)));
    } catch { }
  }

  private persistBookmarkedIds(ids: Set<string>): void {
    if (!isPlatformBrowser(this.platformId)) return;
    try { localStorage.setItem('apna_bookmarked_posts', JSON.stringify([...ids])); } catch { }
  }

  isBookmarked(postId: string): boolean { return this.bookmarkedPostIds().has(postId); }

  private restoreReadHistory(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    const entries = this.readingHistory.getEntries();
    const ids     = new Set(entries.map(e => e.id));
    this.readHistoryIds.set(ids);
    this.historyLoaded.set(true);

    // Load per-post reading progress saved by blog-detail on leave
    const map = new Map<string, number>();
    for (const e of entries) {
      try {
        const saved = localStorage.getItem(`apna_progress_${e.id}`);
        if (saved) map.set(e.id, parseInt(saved, 10));
      } catch { /* quota */ }
    }
    this.progressMap.set(map);

    // Reading streak: count distinct calendar days in read history
    this.readingStreak.set(this.computeStreak(entries));
  }

  private computeStreak(entries: { readAt: number }[]): number {
    if (!entries.length) return 0;
    const today     = new Date(); today.setHours(0, 0, 0, 0);
    const days      = new Set(entries.map(e => {
      const d = new Date(e.readAt); d.setHours(0, 0, 0, 0); return d.getTime();
    }));
    let streak = 0;
    let cursor = today.getTime();
    while (days.has(cursor)) {
      streak++;
      cursor -= 86_400_000;
    }
    return streak;
  }

  getSavedProgress(postId: string): number { return this.progressMap().get(postId) ?? 0; }

  isRead(postId: string): boolean { return this.readHistoryIds().has(postId); }

  toggleBookmark(postId: string, event: Event): void {
    event.stopPropagation();
    const newSet = new Set(this.bookmarkedPostIds());
    if (newSet.has(postId)) newSet.delete(postId);
    else newSet.add(postId);
    this.bookmarkedPostIds.set(newSet);
    this.persistBookmarkedIds(newSet);
  }


  get currentUser(): User | null    { return this.currentUserData(); }
  get isLoggedIn(): boolean         { return this.auth.isAuthorized() && !!this.currentUserData(); }
  get loggedInUserName(): string    { return this.currentUserData()?.name ?? 'Anonymous'; }
  get loggedInFirstName(): string   { return this.currentUserData()?.name?.split(' ')[0] ?? 'Me'; }
  get loggedInAvatar(): string      { return (this.currentUserData() as any)?.avatar ?? ''; }
  get dashboardRoute(): string {
    const u = this.currentUserData();
    if (!u) return '/';
    const role = (u as any).role;
    const id   = (u as any)._id;
    if (role === 'admin')       return `/admin/${id}`;
    if (role === 'super_admin') return `/super-admin/${id}`;
    return `/user/${id}`;
  }

  private patchPost(postId: string, updates: Partial<Post>): void {
    this.allPosts.set(
      this.allPosts().map(p => p._id === postId ? { ...p, ...updates } : p)
    );
  }

  trackByPostId(_index: number, post: Post): string { return post._id; }
  trackByCategory(_index: number, cat: string): string { return cat; }
  trackByTag(_index: number, tag: string): string { return tag; }
}