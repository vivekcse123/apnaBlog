import {
  Component, inject, signal, computed, OnInit, OnDestroy, DestroyRef,
  Input, HostBinding, ChangeDetectionStrategy, WritableSignal, PLATFORM_ID,
  HostListener, ElementRef, ViewChild
} from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../../environments/environment';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CommonModule, isPlatformBrowser, NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Meta, Title } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { of, Subject, EMPTY } from 'rxjs';
import { debounceTime, distinctUntilChanged, catchError, expand, reduce, timeout } from 'rxjs/operators';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { PostService } from '../../../post/services/post-service';
import { ShortsService } from '../../../shorts/services/shorts.service';
import { VideoShort } from '../../../shorts/models/video-short.model';
import { Post } from '../../../../core/models/post.model';
import { ThemeService } from '../../../../core/services/theme-service';
import { Auth } from '../../../../core/services/auth';
import { UserService } from '../../../user/services/user-service';
import { User } from '../../../user/models/user.mode';
import { WelcomeModal } from '../welcome.modal';
import { FormatCountPipe } from '../../../../shared/pipes/format-count-pipe';
import { TimeAgoPipe }     from '../../../../shared/pipes/time-ago-pipe';
import { MobileBottomNav } from '../../../../shared/mobile-bottom-nav/mobile-bottom-nav';
import { PostCache, PostWithTs } from '../../../post/services/post-cache';
import { ReadingHistory }        from '../../../../core/services/reading-history';
import { AllPostsCache }         from '../../../../core/services/all-posts-cache';
import { TaxonomyService }       from '../../../../core/services/taxonomy.service';
import { BookmarkService }       from '../../../../core/services/bookmark.service';
import { PushNotificationService } from '../../../../core/services/push-notification.service';

const PAGE_SIZE   = 8;
const FETCH_LIMIT = 20;   // posts per server page — keeps initial payload small

const STATS_KEY    = 'apna_site_stats_v3'; // v3 — includes accurate category counts
const STATS_TTL_MS = 30 * 60 * 1000;

interface PersistedStats {
  total: number;
  totalViews: number;
  categoryCounts: Record<string, number>;
  ts: number;
}

function readPersistedStats(): PersistedStats {
  const empty: PersistedStats = { total: 0, totalViews: 0, categoryCounts: {}, ts: 0 };
  try {
    if (typeof localStorage === 'undefined') return empty;
    const raw = localStorage.getItem(STATS_KEY);
    if (!raw) return empty;
    const p = JSON.parse(raw);
    return {
      total:           Number(p.total)      || 0,
      totalViews:      Number(p.totalViews) || 0,
      categoryCounts:  (p.categoryCounts && typeof p.categoryCounts === 'object') ? p.categoryCounts : {},
      ts:              Number(p.ts)         || 0,
    };
  } catch { return empty; }
}

function persistStats(total: number, totalViews: number, categoryCounts: Record<string, number>): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STATS_KEY, JSON.stringify({ total, totalViews, categoryCounts, ts: Date.now() }));
    }
  } catch { /* quota */ }
}

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [RouterLink, CommonModule, FormsModule, NgTemplateOutlet, WelcomeModal, FormatCountPipe, TimeAgoPipe, MobileBottomNav],
  templateUrl: './home.html',
  styleUrl: './home.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Home implements OnInit, OnDestroy {
  private postService     = inject(PostService);
  private shortsService   = inject(ShortsService);
  private postCache       = inject(PostCache);
  private allPostsCache   = inject(AllPostsCache);
  private readingHistory  = inject(ReadingHistory);
  taxonomyService         = inject(TaxonomyService);
  bookmarkService         = inject(BookmarkService);
  private destroyRef     = inject(DestroyRef);
  private route          = inject(ActivatedRoute);
  private router         = inject(Router);
  private auth           = inject(Auth);
  private http           = inject(HttpClient);
  pushService            = inject(PushNotificationService);
  private userService    = inject(UserService);
  themeService           = inject(ThemeService);
  private platformId     = inject(PLATFORM_ID);
  private meta           = inject(Meta);
  private titleService   = inject(Title);
  private document       = inject(DOCUMENT);

  @Input() standalone = true;
  @HostBinding('class.mode-embedded') get isEmbedded() { return !this.standalone; }
  @ViewChild('searchInput') searchInputEl?: ElementRef<HTMLInputElement>;

  allPosts           = signal<PostWithTs[]>([]);
  sponsoredFromApi    = signal<PostWithTs[]>([]);
  sponsoredShorts     = signal<VideoShort[]>([]);
  showSponsoredShorts = computed(() => this.sponsoredShorts().length > 0);
  isLoading          = signal(true);
  menuOpen: WritableSignal<boolean> = signal(false);
  searchQuery      = signal('');
  selectedCategory = signal('');
  selectedTag          = signal('');
  selectedReadingTime  = signal<'' | 'quick' | 'medium' | 'long'>('');
  selectedSort         = signal('newest');
  showScrollTop    = signal(false);

  mobileTab = signal<'for-you' | 'trending' | 'latest'>('for-you');

  showWelcomeModal      = signal(false);
  showInstallBanner     = signal(false);
  showInstallModal      = signal(false);
  showAndroidSteps      = signal(false);
  pwaInstalls           = signal(0);
  installToast          = signal('');
  isAppInstalled        = signal(false);
  private installPrompt: any = null;

  readonly APK_URL = environment.apkUrl;
  private welcomeTimerId: ReturnType<typeof setTimeout> | null = null;

  // Server-side pagination state
  private serverPage       = signal(1);
  private serverTotalPages = signal(1);
  hasMoreOnServer          = signal(false);
  isFetchingMore           = signal(false);

  // Server-reported totals — hydrated from localStorage so stats show immediately
  private _persistedStats  = readPersistedStats();
  private serverTotal      = signal(this._persistedStats.total);
  private serverTotalViews = signal(this._persistedStats.totalViews);
  // Monotonically increasing total views — never decreases to prevent flicker
  private _maxSeenViews       = signal(this._persistedStats.totalViews);
  // Accurate category counts from full stats fetch — persisted across sessions
  private _allCategoryCounts  = signal<Record<string, number>>(this._persistedStats.categoryCounts);
  // ALL published posts from the full paginated fetch — used for filtering so
  // category/tag/search results are never limited to the 20-post display page
  private _fullPostPool       = signal<PostWithTs[]>([]);
  // True while fetchAccurateStats is in flight (shows skeleton in filter results)
  filterPoolLoading           = signal(true);

  trendingPage = signal(0);
  hotPage      = signal(0);
  latestPage   = signal(0);
  filteredPage = signal(0);

  likedPostIds      = signal<Set<string>>(new Set());
  bookmarkedPostIds = this.bookmarkService.bookmarkedIds;

  // ── Personalization signals (browser-only — always false/empty on SSR) ──────
  historyLoaded    = signal(false);
  readHistoryIds   = signal<Set<string>>(new Set());
  progressMap      = signal<Map<string, number>>(new Map());
  readingStreak    = signal(0);

  // Newsletter subscribe
  subscribeEmail   = '';
  subscribing      = signal(false);
  subscribeSuccess = signal(false);
  subscribeMessage = signal('');
  subscribeError   = signal('');
  emailInputError  = signal('');

  private static readonly EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  onEmailInput(value: string): void {
    this.subscribeEmail = value;
    if (!value.trim()) { this.emailInputError.set(''); return; }
    this.emailInputError.set(
      Home.EMAIL_RE.test(value.trim()) ? '' : 'Please enter a valid email address'
    );
  }


  private currentUserData = signal<User | null>(null);
  private searchInput$    = new Subject<string>();

  readonly skeletonItems: null[] = new Array(8).fill(null);

  // Fallback list used before taxonomy API responds (avoids empty UI flash)
  private readonly FALLBACK_CATEGORIES = [
    'Update','News','Sports','Entertainment','Health','Technology','Business',
    'Lifestyle','Education','Exercise','Cooking','Social','Quotes','Village',
  ];

  categories = computed<string[]>(() => {
    const names = this.taxonomyService.categoryNames();
    return names.length ? names : this.FALLBACK_CATEGORIES;
  });

  categoryEmojis = computed<Record<string, string>>(() =>
    this.taxonomyService.categoryEmojiMap()
  );

  private readingTimeCache = new Map<string, number>();

  private byLikes = computed(() => {
    const all = this.allPosts();
    const sponsored = all.filter(p => p.isSponsored).sort((a, b) => b.likesCount - a.likesCount);
    const regular   = all.filter(p => !p.isSponsored).sort((a, b) => b.likesCount - a.likesCount);
    return [...sponsored, ...regular];
  });
  private byViews = computed(() => {
    const all = this.allPosts();
    const sponsored = all.filter(p => p.isSponsored).sort((a, b) => b.views - a.views);
    const regular   = all.filter(p => !p.isSponsored).sort((a, b) => b.views - a.views);
    return [...sponsored, ...regular];
  });
  private byDate = computed(() => {
    const all = this.allPosts();
    const sponsored = all.filter(p => p.isSponsored).sort((a, b) => b._ts - a._ts);
    const regular   = all.filter(p => !p.isSponsored).sort((a, b) => b._ts - a._ts);
    return [...sponsored, ...regular];
  });

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
    // Use full pool (all published posts) when available so filters show all matches,
    // not just the 20 currently loaded for display
    const pool = this._fullPostPool();
    let posts: PostWithTs[] = pool.length > 0 ? pool : this.allPosts().filter(p => p.status === 'published');

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

  // Use full-dataset counts when available (from fetchAccurateStats),
  // fall back to loaded posts only while stats are still fetching
  categoryCounts = computed((): Record<string, number> => {
    const accurate = this._allCategoryCounts();
    if (Object.keys(accurate).length > 0) return accurate;
    // Fallback: count from currently loaded posts
    const counts: Record<string, number> = {};
    for (const post of this.allPosts()) {
      if (post.status !== 'published') continue;
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

  /** Top 15 tags by frequency across published posts only. */
  popularTags = computed(() => {
    const counts = new Map<string, number>();
    for (const post of this.allPosts()) {
      if (post.status !== 'published') continue;
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

  // Only show stories count once we have an accurate server-side total
  publishedCount = computed(() => this.serverTotal());

  activeTopicsCount = computed(() => this.categories().length);

  // Always the highest total views seen — never decreases
  totalViews = computed(() => this._maxSeenViews());

  // True once stats-fetch has returned accurate data
  storiesReady   = computed(() => this.serverTotal() > 0);
  totalReadsReady = computed(() => this._maxSeenViews() > 0);

  /** Unique author count — used as a proxy for community members */
  communityMembersCount = computed(() => {
    const ids = new Set(this.allPosts().filter(p => p.user?._id).map(p => p.user._id));
    return ids.size;
  });
  communityMembersReady = computed(() => this.communityMembersCount() > 0);

  /** Authors who have published 2+ posts — "top contributors" */
  topContributorsCount = computed(() => {
    const counts = new Map<string, number>();
    for (const post of this.allPosts()) {
      const id = post.user?._id;
      if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    return [...counts.values()].filter(c => c >= 2).length;
  });
  topContributorsReady = computed(() => this.topContributorsCount() > 0);

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

  /** Sponsored posts — sourced only from the dedicated API call (never from stale cache). */
  sponsoredPosts = computed(() => this.sponsoredFromApi().slice(0, 4));
  showSponsored = computed(() => this.sponsoredPosts().length > 0);

  navCatOpen   = signal(false);
  filterOpen   = signal(false);

  // Use synchronous auth signals (localStorage) so the button routes correctly
  // even before the API call resolves — avoids the timing gap where
  // isLoggedIn=false while the token is valid but currentUserData() is still null.
  get writeRoute(): string {
    if (!this.auth.isAuthorized()) return '/auth/login';
    const id   = this.auth.userId();
    const role = this.auth.userRole();
    if (!id) return '/auth/login';
    if (role === 'admin')       return `/admin/${id}`;
    if (role === 'super_admin') return `/super-admin/${id}`;
    if (role === 'sponsor')     return `/sponsor/${id}`;
    return `/user/${id}`;
  }

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
    this.bookmarkService.syncFromServer();
    this.restoreReadHistory();
    this.loadPwaInstalls();

    if (isPlatformBrowser(this.platformId)) {
      // Detect if already running as installed PWA (standalone mode)
      const standalone = window.matchMedia('(display-mode: standalone)').matches
        || (navigator as any).standalone === true;
      this.isAppInstalled.set(standalone);
    }

    if (isPlatformBrowser(this.platformId)) {
      const alreadySeen = sessionStorage.getItem('apna_welcome_seen');
      if (!alreadySeen) {
        const delay = 2000 + Math.random() * 1000;
        this.welcomeTimerId = setTimeout(() => this.showWelcomeModal.set(true), delay);
      }

      // Always capture prompt so clicking Downloads works anytime
      const capturePrompt = (prompt: any) => {
        this.installPrompt = prompt;
        (window as any).__pwaPrompt = null;

        // Auto-show banner only from 2nd visit & not recently dismissed
        const dismissed = localStorage.getItem('apna_install_dismissed');
        const notDismissed = Date.now() - parseInt(dismissed || '0') > 7 * 24 * 60 * 60 * 1000;
        const alreadyCountedThisSession = sessionStorage.getItem('apna_visit_counted');
        if (!alreadyCountedThisSession) {
          sessionStorage.setItem('apna_visit_counted', '1');
          const v = parseInt(localStorage.getItem('apna_visit_count') || '0') + 1;
          localStorage.setItem('apna_visit_count', String(v));
        }
        const visitCount = parseInt(localStorage.getItem('apna_visit_count') || '0');
        if (notDismissed && visitCount >= 2) {
          setTimeout(() => this.showInstallBanner.set(true), 3000);
        }
      };

      const early = (window as any).__pwaPrompt;
      if (early) {
        capturePrompt(early);
      } else {
        window.addEventListener('beforeinstallprompt', (e: Event) => {
          e.preventDefault();
          capturePrompt(e);
        });
      }

      // Track installs via browser menu "Add to Home Screen"
      window.addEventListener('appinstalled', () => {
        this.recordPwaInstall();
      });
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
    ).subscribe(val => {
      this.searchQuery.set(val);
      if (val.trim()) setTimeout(() => this.scrollToSearchInput(), 400);
    });

    this.loadInitialData();
    this.taxonomyService.load().pipe(takeUntilDestroyed(this.destroyRef)).subscribe();
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
    this.fetchAccurateStats();
    this.loadSponsoredPosts();
    this.loadSponsoredShorts();
  }

  private loadSponsoredShorts(): void {
    this.shortsService.getSponsoredShorts()
      .pipe(takeUntilDestroyed(this.destroyRef), catchError(() => of({ status: 200, data: [] })))
      .subscribe(res => this.sponsoredShorts.set(res.data ?? []));
  }

  private loadSponsoredPosts(): void {
    this.postService.getSponsoredPosts()
      .pipe(takeUntilDestroyed(this.destroyRef), catchError(() => of(null)))
      .subscribe(res => {
        if (!res?.data?.length) return;
        const posts: PostWithTs[] = res.data.map((p: Post) => ({
          ...p,
          _ts:        new Date(p.createdAt).getTime(),
          views:      (p as any).views      ?? 0,
          likesCount: (p as any).likesCount ?? 0,
        }));
        this.sponsoredFromApi.set(posts);
      });
  }

  /**
   * Always runs on every page load to populate _fullPostPool (needed for accurate
   * category/tag/search filtering). Paginates through ALL server pages (100/page).
   * Only re-persists stats to localStorage when TTL has expired.
   */
  private fetchAccurateStats(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    const { ts, total, totalViews, categoryCounts } = this._persistedStats;
    const statsAreFresh = ts > 0
      && (Date.now() - ts) < STATS_TTL_MS
      && total > 0
      && totalViews > 0
      && Object.keys(categoryCounts).length > 0;

    // If stats are fresh and allPostsCache has posts (populated on previous visit),
    // restore _fullPostPool instantly from cache — no API call needed.
    // This makes category filter results appear immediately when navigating back.
    const cachedPosts = this.allPostsCache.get();
    if (statsAreFresh && cachedPosts.length) {
      const fullPool: PostWithTs[] = cachedPosts.map(p => ({
        ...p,
        _ts:        new Date(p.createdAt).getTime(),
        views:      (p as any).views      ?? 0,
        likesCount: (p as any).likesCount ?? 0,
      }));
      this._fullPostPool.set(fullPool);
      this._allCategoryCounts.set(categoryCounts);
      if (total > 0) this.serverTotal.set(total);
      if (totalViews > 0) this.bumpMaxViews(totalViews);
      this.filterPoolLoading.set(false);
      return;
    }

    this.filterPoolLoading.set(true);

    this.postService.getStatsPage(1)
      .pipe(
        expand(res => {
          const fetched = Number(res.page ?? 1);
          const pages   = res.totalPages ?? 1;
          return fetched < pages
            ? this.postService.getStatsPage(fetched + 1)
            : EMPTY;
        }),
        reduce((acc: Post[], res) => acc.concat(res.data ?? []), [] as Post[]),
        timeout(30_000),
        catchError(() => { this.filterPoolLoading.set(false); return of([] as Post[]); }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((allPosts: Post[]) => {
        this.filterPoolLoading.set(false);
        if (!allPosts.length) return;

        const published  = allPosts.filter(p => p.status === 'published');
        const total      = published.length;
        const totalViews = published.reduce((s, p) => s + ((p as any).views ?? 0), 0);

        // Full post pool — always rebuilt so filtering is always accurate
        const fullPool: PostWithTs[] = published.map(p => ({
          ...p,
          _ts:        new Date(p.createdAt).getTime(),
          views:      (p as any).views      ?? 0,
          likesCount: (p as any).likesCount ?? 0,
        }));
        this._fullPostPool.set(fullPool);

        // Category counts from ALL published posts
        const catCounts: Record<string, number> = {};
        for (const post of published) {
          for (const cat of (post.categories ?? [])) {
            catCounts[cat] = (catCounts[cat] ?? 0) + 1;
          }
        }

        // Populate shared cache so category/tag pages load instantly
        this.allPostsCache.set(published);

        if (total > 0) this.serverTotal.set(total);
        if (totalViews > 0) this.bumpMaxViews(totalViews);
        if (Object.keys(catCounts).length > 0) this._allCategoryCounts.set(catCounts);

        // Only re-persist when TTL has expired (avoids unnecessary localStorage writes)
        if (!statsAreFresh) {
          persistStats(this.serverTotal(), this._maxSeenViews(), catCounts);
        }
      });
  }

  private loadFresh(showLoader: boolean): void {
    if (showLoader) this.isLoading.set(true);

    this.postService.getAllPost(1, FETCH_LIMIT)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        catchError(err => {
          
          this.isLoading.set(false);
          return of(null);
        })
      )
      .subscribe(res => {
        if (!res) return;
        const posts: Post[]      = res.data || [];
        const totalPages: number = res.totalPages || 1;
        // Use totalPages for pagination only — serverTotal is set by fetchAccurateStats
        // which counts only published posts (single source of truth for stats)
        this.serverTotalPages.set(totalPages);

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
          
          this.isFetchingMore.set(false);
          return of(null);
        })
      )
      .subscribe(res => {
        if (!res) return;
        const newPosts: Post[]   = res.data       || [];
        const totalPages: number = res.totalPages  || nextPage;

        this.commitPosts([...this.allPosts(), ...newPosts]);
        this.serverPage.set(nextPage);
        this.hasMoreOnServer.set(nextPage < totalPages);
        this.isFetchingMore.set(false);

        // Re-attach observer to any new sentinels that appeared
        
      });
  }

  private commitPosts(raw: Post[]): void {
    const existing = new Map(this.allPosts().map(p => [p._id, p]));
    const incoming = new Map<string, PostWithTs>();

    for (const p of raw) {
      // Home page is public — only published posts, never drafts/pending
      if (p.status !== 'published') continue;
      if (incoming.has(p._id)) continue;
      const prev = existing.get(p._id);
      incoming.set(p._id, {
        ...p,
        _ts:        new Date(p.createdAt).getTime(),
        views:      Math.max(p.views      ?? 0, prev?.views      ?? 0),
        likesCount: Math.max(p.likesCount ?? 0, prev?.likesCount ?? 0),
      });
    }

    // Keep existing published posts not present in this batch
    for (const [id, p] of existing) {
      if (!incoming.has(id)) incoming.set(id, p);
    }

    const visible = [...incoming.values()];
    this.allPosts.set(visible);
    this.postCache.set(visible);
    this.updateJsonLdPostCount(visible.length);

    // Bump max-seen views — all items in visible are already published
    const summed = visible.reduce((s, p) => s + (p.views ?? 0), 0);
    this.bumpMaxViews(summed);
  }

  private bumpMaxViews(candidate: number): void {
    if (candidate <= 0) return;
    const current = this._maxSeenViews();
    if (candidate > current) {
      this._maxSeenViews.set(candidate);
      persistStats(this.serverTotal(), candidate, this._allCategoryCounts());
    }
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
    const site = environment.siteUrl;
    const og   = environment.ogImage;
    this.titleService.setTitle('ApnaInsights — Community Stories from Every Corner of India');
    this.meta.updateTag({ name: 'description',    content: 'Discover real stories from real people across India. Read and write blogs on Technology, Lifestyle, Health, Business, Education, Village Life and more. Free community blogging platform — join thousands of Indian writers.' });
    this.meta.updateTag({ name: 'keywords',       content: 'Indian blog platform, community stories India, read blogs India, write blogs free, trending stories, technology blog India, village life stories, health stories India, ApnaInsights' });
    this.meta.updateTag({ name: 'robots',         content: 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1' });
    this.meta.updateTag({ name: 'author',         content: 'ApnaInsights Community' });
    this.meta.updateTag({ property: 'og:type',         content: 'website' });
    this.meta.updateTag({ property: 'og:title',        content: 'ApnaInsights — Community Stories from Every Corner of India' });
    this.meta.updateTag({ property: 'og:description',  content: 'Discover real stories from real people across India. Blogs on Technology, Lifestyle, Health, Business, Village Life and more. Free to read, free to write.' });
    this.meta.updateTag({ property: 'og:url',          content: `${site}/` });
    this.meta.updateTag({ property: 'og:site_name',    content: 'ApnaInsights' });
    this.meta.updateTag({ property: 'og:image',        content: og });
    this.meta.updateTag({ property: 'og:image:width',  content: '1200' });
    this.meta.updateTag({ property: 'og:image:height', content: '630' });
    this.meta.updateTag({ property: 'og:image:alt',    content: 'ApnaInsights — Community Stories from Every Corner of India' });
    this.meta.updateTag({ property: 'og:locale',       content: 'en_IN' });
    this.meta.updateTag({ name: 'twitter:card',        content: 'summary_large_image' });
    this.meta.updateTag({ name: 'twitter:title',       content: 'ApnaInsights — Community Stories from India' });
    this.meta.updateTag({ name: 'twitter:description', content: 'Real stories from real people. Blogs on technology, lifestyle, health, village life and more. Free community platform.' });
    this.meta.updateTag({ name: 'twitter:image',       content: og });
    this.meta.updateTag({ name: 'twitter:site',        content: '@apnainsights' });

    let canonical = this.document.querySelector('link[rel="canonical"]') as HTMLLinkElement;
    if (!canonical) {
      canonical = this.document.createElement('link');
      canonical.setAttribute('rel', 'canonical');
      this.document.head.appendChild(canonical);
    }
    canonical.setAttribute('href', `${site}/`);
  }

  private injectJsonLd(): void {
    if (this.document.querySelector('script[data-apna-home-schema]')) return;
    const site = environment.siteUrl;

    const schemas = [
      {
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        '@id': site,
        url: site,
        name: 'ApnaInsights — Community Stories from Every Corner of India',
        description: 'Browse trending, most-viewed, and latest community blogs from writers across India.',
        inLanguage: 'en-IN',
        isPartOf: { '@type': 'WebSite', url: site },
        about: { '@type': 'Thing', name: 'Community Blogging India' },
        breadcrumb: {
          '@type': 'BreadcrumbList',
          itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Home', item: site }]
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

  isIos(): boolean {
    return isPlatformBrowser(this.platformId) && /iphone|ipad|ipod/i.test(navigator.userAgent);
  }

  isAndroid(): boolean {
    return isPlatformBrowser(this.platformId) && /android/i.test(navigator.userAgent);
  }

  isMobile(): boolean {
    return this.isIos() || this.isAndroid();
  }

  canInstallNatively(): boolean {
    return !!this.installPrompt || !!(isPlatformBrowser(this.platformId) && (window as any).__pwaPrompt);
  }

  // Entry point for ALL install triggers.
  triggerInstall(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    if (this.isAndroid()) {
      if (this.canInstallNatively()) {
        // Chrome/Edge/Samsung: fire native PWA prompt immediately — no popup
        this.fireInstallPrompt();
      } else {
        // Other Android browsers: start APK download immediately, then show install guide
        this.startApkDownload();
      }
      return;
    }

    // iOS / desktop — open the modal
    this.showInstallModal.set(true);
  }

  startApkDownload(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    // Trigger download immediately — no popup before this
    const a = this.document.createElement('a');
    a.href = this.APK_URL;
    a.download = 'ApnaInsights.apk';
    this.document.body.appendChild(a);
    a.click();
    this.document.body.removeChild(a);
    // Show post-download install guide after the download dialog appears
    setTimeout(() => this.showAndroidSteps.set(true), 800);
  }

  private async fireInstallPrompt(): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return;
    const prompt = this.installPrompt || (window as any).__pwaPrompt;
    if (!prompt) {
      // Prompt expired — fall back to APK
      if (this.isAndroid()) { this.startApkDownload(); } else { this.showInstallModal.set(true); }
      return;
    }
    this.showInstallBanner.set(false);
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    this.installPrompt = null;
    if (outcome === 'accepted') {
      this.recordPwaInstall();
    } else if (isPlatformBrowser(this.platformId)) {
      localStorage.setItem('apna_install_dismissed', String(Date.now()));
    }
  }

  dismissAndroidSteps(): void {
    this.showAndroidSteps.set(false);
  }

  closeInstallModal(): void {
    this.showInstallModal.set(false);
  }

  // Called by the Install button inside the modal (iOS / desktop path).
  async installFromModal(): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return;

    if (this.canInstallNatively()) {
      this.showInstallModal.set(false);
      this.showInstallBanner.set(false);
      await this.fireInstallPrompt();
    }
    // Otherwise modal stays open showing manual steps
  }

  // Called by the Install button in the bottom auto-banner.
  handleAndroidInstall(): void {
    this.showInstallBanner.set(false);
    this.triggerInstall();
  }

  // Kept for backward-compat with any other callers.
  async installApp(): Promise<void> {
    await this.installFromModal();
  }

  private recordPwaInstall(): void {
    this.http.post(`${environment.apiUrl}/visitor/pwa-install`, {})
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res: any) => this.pwaInstalls.set(res.pwaInstalls ?? 0),
        error: () => {},
      });
  }

  loadPwaInstalls(): void {
    this.http.get<{ pwaInstalls: number }>(`${environment.apiUrl}/visitor/pwa-stats`)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: res => this.pwaInstalls.set(res.pwaInstalls ?? 0),
        error: () => {},
      });
  }

  dismissInstallBanner(): void {
    this.showInstallBanner.set(false);
    if (isPlatformBrowser(this.platformId)) {
      localStorage.setItem('apna_install_dismissed', String(Date.now()));
    }
  }

  onSearchInput(value: string): void {
    this.searchInput$.next(value);
    this.resetVisibleCounts();
  }

  scrollToResultsPublic(): void {
    setTimeout(() => this.scrollToSearchInput(), 300);
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
    this.resetVisibleCounts();
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: next ? { category: next } : {},
      replaceUrl: true,
    });
    if (next) this.scrollToResults();
  }

  private resetVisibleCounts(): void {
    this.filteredPage.set(0);
  }

  private scrollToSearchInput(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    const resultsEl = this.document.getElementById('filtered-results');
    if (!resultsEl) return;
    const headerEl = this.document.querySelector('.header') as HTMLElement;
    const filterWrap = this.document.querySelector('.filter-wrap') as HTMLElement;
    const headerH = headerEl ? headerEl.offsetHeight : 64;
    const filterH = filterWrap ? filterWrap.offsetHeight : 50;
    const top = resultsEl.getBoundingClientRect().top + window.scrollY - headerH - filterH - 8;
    window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
  }

  private scrollToResults(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const filterWrap = this.document.querySelector('.filter-wrap') as HTMLElement;
        const resultsEl  = this.document.getElementById('filtered-results') as HTMLElement | null;
        if (!resultsEl) return;
        const filterBottom = filterWrap ? filterWrap.getBoundingClientRect().bottom : 66;
        const top = resultsEl.getBoundingClientRect().top + window.scrollY - filterBottom - 12;
        window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
      });
    });
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
    if (tag) this.scrollToResults();
  }

  onTimeSelectChange(rt: string): void {
    this.selectedReadingTime.set(rt as any);
    this.resetVisibleCounts();
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: rt ? { rt } : {},
      replaceUrl: true,
    });
    if (rt) this.scrollToResults();
  }

  onSortChange(sort: string): void {
    this.selectedSort.set(sort);
    this.resetVisibleCounts();
    if (this.isFiltering()) this.scrollToResults();
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

  onSubscribe(): void {
    const email = this.subscribeEmail.trim();
    if (!email || this.subscribing()) return;
    this.subscribing.set(true);
    this.subscribeError.set('');
    this.http.post<{ status: number; message: string }>(
      `${environment.apiUrl}/subscribers/subscribe`, { email }
    ).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: res => {
        this.subscribing.set(false);
        this.subscribeSuccess.set(true);
        this.subscribeMessage.set(res.message ?? 'Subscribed successfully!');
        this.subscribeEmail = '';
      },
      error: err => {
        this.subscribing.set(false);
        this.subscribeError.set(err?.error?.message ?? 'Something went wrong. Please try again.');
      },
    });
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

  isBookmarked(postId: string): boolean { return this.bookmarkService.isBookmarked(postId); }

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
    this.bookmarkService.toggle(postId);
  }


  get currentUser(): User | null    { return this.currentUserData(); }
  get isLoggedIn(): boolean         { return this.auth.isAuthorized() && !!this.currentUserData(); }
  get loggedInUserName(): string    { return this.currentUserData()?.name ?? 'Anonymous'; }
  get loggedInFirstName(): string   { return this.currentUserData()?.name?.split(' ')[0] ?? 'Me'; }
  get loggedInAvatar(): string      { return (this.currentUserData() as any)?.avatar ?? ''; }
  get dashboardRoute(): string {
    const id   = this.auth.userId();
    const role = this.auth.userRole();
    if (!id) return '/';
    if (role === 'admin')       return `/admin/${id}`;
    if (role === 'super_admin') return `/super-admin/${id}`;
    if (role === 'sponsor')     return `/sponsor/${id}`;
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