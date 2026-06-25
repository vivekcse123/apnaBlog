import {
  Component, inject, signal, computed, OnInit, OnDestroy, DestroyRef,
  Input, HostBinding, ChangeDetectionStrategy, WritableSignal, PLATFORM_ID,
  HostListener, ElementRef, ViewChild
} from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../../environments/environment';
import { ActivatedRoute, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { CommonModule, isPlatformBrowser, NgTemplateOutlet, Location } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, Meta, SafeHtml, Title } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { of, Subject, EMPTY, interval } from 'rxjs';
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
import { CloudinaryResizePipe } from '../../../../shared/pipes/cloudinary-resize-pipe';
import { MobileBottomNav } from '../../../../shared/mobile-bottom-nav/mobile-bottom-nav';
import { PostCache, PostWithTs } from '../../../post/services/post-cache';
import { ReadingHistory }        from '../../../../core/services/reading-history';
import { AllPostsCache }         from '../../../../core/services/all-posts-cache';
import { TaxonomyService }       from '../../../../core/services/taxonomy.service';
import { BookmarkService }       from '../../../../core/services/bookmark.service';
import { PushNotificationService } from '../../../../core/services/push-notification.service';

const PAGE_SIZE   = 8;
const FETCH_LIMIT = 20;   // posts per server page - keeps initial payload small

const STATS_KEY    = 'apna_site_stats_v3'; // v3 - includes accurate category counts
const STATS_TTL_MS = 30 * 60 * 1000;

const RECENT_SEARCHES_KEY = 'apna_recent_searches';
const HERO_PLACEHOLDERS = [
  'Search stories, news, sports…',
  'Search AI, Technology, Sports…',
  'What would you like to explore today?',
];

function readRecentSearches(): string[] {
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(RECENT_SEARCHES_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter(s => typeof s === 'string').slice(0, 5) : [];
  } catch { return []; }
}

function writeRecentSearches(list: string[]): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(list.slice(0, 5)));
    }
  } catch { /* quota */ }
}

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
  imports: [RouterLink, RouterLinkActive, CommonModule, FormsModule, NgTemplateOutlet, WelcomeModal, FormatCountPipe, TimeAgoPipe, CloudinaryResizePipe, MobileBottomNav],
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
  private location       = inject(Location);
  private auth           = inject(Auth);
  private http           = inject(HttpClient);
  pushService            = inject(PushNotificationService);
  private userService    = inject(UserService);
  themeService           = inject(ThemeService);
  private platformId     = inject(PLATFORM_ID);
  private sanitizer      = inject(DomSanitizer);
  private meta           = inject(Meta);
  private titleService   = inject(Title);
  private document       = inject(DOCUMENT);

  @Input() standalone = true;
  @HostBinding('class.mode-embedded') get isEmbedded() { return !this.standalone; }
  @ViewChild('searchInput') searchInputEl?: ElementRef<HTMLInputElement>;
  @ViewChild('megaSearchInput') megaSearchInputEl?: ElementRef<HTMLInputElement>;

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

  // Hero "mega search" - centered search bar + discovery dropdown
  heroSearchOpen     = signal(false);
  heroDropdownQuery  = signal('');
  recentSearches     = signal<string[]>(readRecentSearches());
  heroPlaceholderIdx = signal(0);
  heroPlaceholder    = computed(() => HERO_PLACEHOLDERS[this.heroPlaceholderIdx()]);

  activeChallenge = signal<{ _id: string; title: string; description: string; prize: string | null; endDate: string; submissionCount: number; winnersDeclared: boolean } | null>(null);
  featuredWinners = signal<any[]>([]);

  showWelcomeModal      = signal(false);
  showInstallBanner     = signal(false);
  showInstallModal      = signal(false);
  showAndroidSteps      = signal(false);
  pwaInstalls           = signal(0);
  installToast          = signal('');
  isAppInstalled        = signal(false);
  installStripDismissed = signal(false);
  private installPrompt: any = null;

  readonly APK_URL = environment.apkUrl;
  private welcomeTimerId: ReturnType<typeof setTimeout> | null = null;

  // Server-side pagination state
  private serverPage       = signal(1);
  private serverTotalPages = signal(1);
  hasMoreOnServer          = signal(false);
  isFetchingMore           = signal(false);

  // Server-reported totals - hydrated from localStorage so stats show immediately
  private _persistedStats  = readPersistedStats();
  private serverTotal      = signal(this._persistedStats.total);
  private serverTotalViews = signal(this._persistedStats.totalViews);
  // Monotonically increasing total views - never decreases to prevent flicker
  private _maxSeenViews       = signal(this._persistedStats.totalViews);
  // Accurate category counts from full stats fetch - persisted across sessions
  private _allCategoryCounts  = signal<Record<string, number>>(this._persistedStats.categoryCounts);
  // ALL published posts from the full paginated fetch - used for filtering so
  // category/tag/search results are never limited to the 20-post display page
  private _fullPostPool       = signal<PostWithTs[]>([]);
  // True while fetchAccurateStats is in flight (shows skeleton in filter results)
  filterPoolLoading           = signal(true);
  filterError                 = signal('');

  trendingPage = signal(0);
  hotPage      = signal(0);
  latestPage   = signal(0);
  filteredPage = signal(0);

  // Infinite scroll: grows as user scrolls; resets when filters change
  filteredVisibleCount = signal(PAGE_SIZE);
  filterOutOfView      = signal(false);

  likedPostIds      = signal<Set<string>>(new Set());
  bookmarkedPostIds = this.bookmarkService.bookmarkedIds;

  // ── Personalization signals (browser-only - always false/empty on SSR) ──────
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

  readonly faqItems = [
    {
      q: 'Is ApnaInsights free to use?',
      a: 'Yes, ApnaInsights is completely free. Free to read all guides and articles, and free to write and publish your own. No subscription, no payment, and no paywall, ever.',
    },
    {
      q: 'Who can write on ApnaInsights?',
      a: 'Anyone can write on ApnaInsights. Create a free account and start sharing your expertise on topics like Technology, Career, Health, Lifestyle, Business, Education, and more. Our editorial team reviews every submission before it goes live.',
    },
    {
      q: 'What topics can I read about on ApnaInsights?',
      a: 'ApnaInsights covers 16+ topics including Technology, Career, Health, Sports, Business, Entertainment, Education, Lifestyle, Finance, Productivity, AI, Cooking, Exercise, and more. All articles are written by verified contributors from across India.',
    },
    {
      q: 'Can I read articles in Hindi or other Indian languages?',
      a: 'Yes! ApnaInsights has a built-in translation feature on every article that lets you read in Hindi, Marathi, Tamil, Telugu, Malayalam, and Kannada. No third-party app needed.',
    },
    {
      q: 'How do I get started on ApnaInsights?',
      a: 'Simply visit apnainsights.com and browse or search for any topic. To write, create a free account using your email or Google account. No setup or payment required.',
    },
    {
      q: 'Is ApnaInsights available as a mobile app?',
      a: 'ApnaInsights is a Progressive Web App (PWA). You can install it directly on your Android or iOS device from your browser. No app store download required. It works offline and feels like a native app.',
    },
  ];

  // Fallback list used before taxonomy API responds (avoids empty UI flash)
  private readonly FALLBACK_CATEGORIES = [
    'Update','News','Sports','Entertainment','Health','Technology','Business',
    'Lifestyle','Education','Exercise','Cooking','Social','Quotes','Village',
    'Career','AI','Finance','Productivity',
  ];

  categories = computed<string[]>(() => {
    const names = this.taxonomyService.categoryNames();
    return names.length ? names : this.FALLBACK_CATEGORIES;
  });

  private static readonly CATEGORY_ICONS: Record<string, string> = {
    Technology:    `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>`,
    Career:        `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/></svg>`,
    Health:        `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`,
    Business:      `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>`,
    Education:     `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>`,
    Lifestyle:     `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`,
    Sports:        `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="6"/><path d="M15.477 12.89L17 22l-5-3-5 3 1.523-9.11"/></svg>`,
    Finance:       `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>`,
    Productivity:  `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>`,
    AI:            `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/><line x1="9" y1="20" x2="9" y2="23"/><line x1="15" y1="20" x2="15" y2="23"/><line x1="20" y1="9" x2="23" y2="9"/><line x1="20" y1="14" x2="23" y2="14"/><line x1="1" y1="9" x2="4" y2="9"/><line x1="1" y1="14" x2="4" y2="14"/></svg>`,
    Cooking:       `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></svg>`,
    Exercise:      `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>`,
    Entertainment: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>`,
    'Social Issues':`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
    Social:        `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
    Update:        `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>`,
    News:          `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>`,
    Quotes:        `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`,
    Village:       `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`,
  };

  private static readonly FALLBACK_ICON = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/></svg>`;

  getCategoryIcon(cat: string): SafeHtml {
    const svg = Home.CATEGORY_ICONS[cat] ?? Home.FALLBACK_ICON;
    return this.sanitizer.bypassSecurityTrustHtml(svg);
  }

  categoryEmojis = computed<Record<string, string>>(() =>
    this.taxonomyService.categoryEmojiMap()
  );

  private readingTimeCache = new Map<string, number>();

  // "Trending Today" - ranked by the time-decayed hotScore (refreshed on every
  // like/comment/view) so the list shifts day to day as engagement changes,
  // instead of being pinned to all-time likesCount. Falls back to likesCount
  // for posts whose hotScore hasn't been computed yet (score === 0/undefined).
  // Editorial-only posts - sponsored content has its own dedicated section
  // and must not appear in editorial feeds (Trending, Hot, Latest, Filtered).
  private editorialPosts = computed(() => this.allPosts().filter(p => !p.isSponsored));

  private byLikes = computed(() => {
    const all = this.editorialPosts();
    const score = (p: PostWithTs) => (p.hotScore || p.likesCount);
    return [...all].sort((a, b) => score(b) - score(a));
  });
  private byViews = computed(() => {
    return [...this.editorialPosts()].sort((a, b) => b.views - a.views);
  });
  private byDate = computed(() => {
    return [...this.editorialPosts()].sort((a, b) => b._ts - a._ts);
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

  trendingPageCount = computed(() => Math.max(1, Math.ceil(this.editorialPosts().length / PAGE_SIZE)));
  hotPageCount      = computed(() => Math.max(1, Math.ceil(this.editorialPosts().length / PAGE_SIZE)));
  latestPageCount   = computed(() => Math.max(1, Math.ceil(this.editorialPosts().length / PAGE_SIZE)));

  filteredPageCount    = computed(() => Math.max(1, Math.ceil(this.filteredPosts().length / PAGE_SIZE)));
  visibleFilteredPosts = computed(() => this.filteredPosts().slice(0, this.filteredVisibleCount()));
  hasMoreFiltered      = computed(() => this.filteredVisibleCount() < this.filteredPosts().length);
  // Only show "all loaded" after user has scrolled past the first page of results
  showAllLoadedBanner  = computed(() => !this.hasMoreFiltered() && this.filteredPosts().length > PAGE_SIZE);

  filteredPosts = computed(() => {
    const cat  = this.selectedCategory();
    const tag  = this.selectedTag();
    const rt   = this.selectedReadingTime();
    const q    = this.searchQuery().trim().toLowerCase();
    const sort = this.selectedSort();
    // Use full pool (editorial posts only - sponsored excluded from all filtered views)
    const pool = this._fullPostPool();
    let posts: PostWithTs[] = (pool.length > 0 ? pool : this.allPosts().filter(p => p.status === 'published'))
      .filter(p => !p.isSponsored);

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

  // ── Hero "mega search" dropdown content ──────────────────────────────
  // All derived from data already loaded for the page - no extra requests.
  // When the user is typing, each list is filtered client-side; otherwise
  // a default top-N slice is shown.
  heroDropdownHasQuery = computed(() => this.heroDropdownQuery().trim().length > 0);

  heroDropdownCategories = computed(() => {
    const q = this.heroDropdownQuery().trim().toLowerCase();
    const cats = this.categories();
    return (q ? cats.filter(c => c.toLowerCase().includes(q)) : cats).slice(0, 8);
  });

  heroDropdownTrending = computed(() => {
    const q = this.heroDropdownQuery().trim().toLowerCase();
    const posts = this.byViews();
    return (q ? posts.filter(p => p.title.toLowerCase().includes(q)) : posts).slice(0, 3);
  });

  heroDropdownLatest = computed(() => {
    const q = this.heroDropdownQuery().trim().toLowerCase();
    const posts = this.byDate();
    return (q ? posts.filter(p => p.title.toLowerCase().includes(q)) : posts).slice(0, 3);
  });

  heroDropdownWriters = computed(() => {
    const q = this.heroDropdownQuery().trim().toLowerCase();
    const seen = new Set<string>();
    const writers: { id: string; name: string; reads: number }[] = [];
    for (const post of this.byLikes()) {
      const id   = post.user?._id;
      const name = post.user?.name || 'Anonymous';
      if (!id || seen.has(id)) continue;
      if (q && !name.toLowerCase().includes(q)) continue;
      seen.add(id);
      writers.push({ id, name, reads: post.views });
      if (writers.length >= 4) break;
    }
    return writers;
  });

  heroDropdownTags = computed(() => {
    const q = this.heroDropdownQuery().trim().toLowerCase();
    const tags = this.popularTags();
    return (q ? tags.filter(t => t.toLowerCase().includes(q)) : tags).slice(0, 8);
  });

  /** IDs of the top-5 trending posts - used to show the 🔥 badge on cards. */
  private trendingTopIds = computed(() =>
    new Set(this.byLikes().slice(0, 5).map((p: PostWithTs) => p._id))
  );

  isTrending(postId: string): boolean { return this.trendingTopIds().has(postId); }

  // Only show stories count once we have an accurate server-side total
  publishedCount = computed(() => this.serverTotal());

  activeTopicsCount = computed(() => this.categories().length);

  // Always the highest total views seen - never decreases
  totalViews = computed(() => this._maxSeenViews());

  // True once stats-fetch has returned accurate data
  storiesReady   = computed(() => this.serverTotal() > 0);
  totalReadsReady = computed(() => this._maxSeenViews() > 0);

  totalViewCount = computed(() => {
    const v = this._maxSeenViews();
    if (v >= 1_000_000) return (v / 1_000_000).toFixed(1) + 'M+';
    if (v >= 1_000)     return (v / 1_000).toFixed(1) + 'K+';
    return v > 0 ? String(v) + '+' : '-';
  });

  /** Unique author count - used as a proxy for community members */
  communityMembersCount = computed(() => {
    const ids = new Set(this.allPosts().filter(p => p.user?._id).map(p => p.user._id));
    return ids.size;
  });
  communityMembersReady = computed(() => this.communityMembersCount() > 0);

  /** Authors who have published 2+ posts - "top contributors" */
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

  /** Sponsored posts - sourced only from the dedicated API call (never from stale cache). */
  sponsoredPosts = computed(() => this.sponsoredFromApi().slice(0, 4));
  showSponsored = computed(() => this.sponsoredPosts().length > 0);

  navCatOpen   = signal(false);
  navMoreOpen  = signal(false);
  filterOpen   = signal(false);

  // Use synchronous auth signals (localStorage) so the button routes correctly
  // even before the API call resolves - avoids the timing gap where
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
    const t = e.target as HTMLElement;
    if (!t.closest('.nav-cat-wrap'))  this.navCatOpen.set(false);
    if (!t.closest('.nav-more-wrap')) this.navMoreOpen.set(false);
    if (!t.closest('.v2-hero-search-zone')) this.closeHeroSearch();
  }

  @HostListener('document:keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    const tag = (event.target as Element).tagName;
    if (event.key === '/' && !['INPUT', 'TEXTAREA'].includes(tag)) {
      event.preventDefault();
      this.searchInputEl?.nativeElement?.focus();
    }
    if (event.key === 'Escape') {
      if (this.menuOpen())    this.menuOpen.set(false);
      if (this.navCatOpen())  this.navCatOpen.set(false);
      if (this.navMoreOpen()) this.navMoreOpen.set(false);
      if (this.heroSearchOpen()) this.closeHeroSearch();
      if (this.showWelcomeModal()) this.dismissWelcomeModal();
    }
  }

  @HostListener('window:scroll')
  onScroll(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    const scrollY = window.scrollY;

    this.showScrollTop.set(scrollY > 500);

    // Infinite scroll: load next batch when within 400px of page bottom
    if (this.isFiltering() && this.hasMoreFiltered()) {
      const nearBottom = scrollY + window.innerHeight >= this.document.documentElement.scrollHeight - 400;
      if (nearBottom) this.filteredVisibleCount.update(n => n + PAGE_SIZE);
    }

    // Floating filter badge: show when filter-wrap has been scrolled past
    const fw = this.document.querySelector('.filter-wrap') as HTMLElement | null;
    if (fw) this.filterOutOfView.set(fw.getBoundingClientRect().bottom < 0);
  }

  ngOnInit(): void {
    this.standalone = this.route.snapshot.data['standalone'] ?? this.standalone;
    this.setMetaTags();
    this.injectJsonLd();

    this.restoreLikedIds();
    this.bookmarkService.syncFromServer();
    this.restoreReadHistory();
    this.loadPwaInstalls();
    this.loadActiveChallenge();
    this.loadFeaturedWinners();

    if (isPlatformBrowser(this.platformId)) {
      // Detect if already running as installed PWA (standalone mode)
      const standalone = window.matchMedia('(display-mode: standalone)').matches
        || (navigator as any).standalone === true;
      this.isAppInstalled.set(standalone);

      if (sessionStorage.getItem('apna_install_strip_dismissed')) {
        this.installStripDismissed.set(true);
      }
    }

    if (isPlatformBrowser(this.platformId)) {
      const alreadySeen = sessionStorage.getItem('apna_welcome_seen');
      if (!alreadySeen) {
        const delay = 2000 + Math.random() * 1000;
        this.welcomeTimerId = setTimeout(() => {
          if (window.innerWidth >= 768) this.showWelcomeModal.set(true);
        }, delay);
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
      if (val.trim()) setTimeout(() => this.scrollToResults(), 400);
    });

    this.loadInitialData();
    this.taxonomyService.load().pipe(takeUntilDestroyed(this.destroyRef)).subscribe();

    // Rotate the hero search placeholder text every few seconds.
    if (isPlatformBrowser(this.platformId)) {
      interval(4000).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
        this.heroPlaceholderIdx.update(i => (i + 1) % HERO_PLACEHOLDERS.length);
      });
    }
  }

  ngOnDestroy(): void {
    if (this.welcomeTimerId !== null) {
      clearTimeout(this.welcomeTimerId);
      this.welcomeTimerId = null;
    }
    this.readingTimeCache.clear();
    const scripts = this.document.querySelectorAll('script[data-apna-home-schema]');
    scripts.forEach(s => s.remove());
    this.document.getElementById('home-trending-schema')?.remove();
  }

  // Tracks which .adsbygoogle <ins> elements have already been pushed -
  // background refreshes can re-trigger pushHomeAds(), and re-pushing an
  // already-initialised <ins> throws "already have ads in them".
  private pushedHomeAds = new WeakSet<Element>();

  private pushHomeAds(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    try {
      const ads: any[] = (window as any).adsbygoogle ?? [];
      (window as any).adsbygoogle = ads;
      const slots = this.document.querySelectorAll('.home-ad-wrap ins.adsbygoogle');
      slots.forEach(el => {
        if (this.pushedHomeAds.has(el)) return;
        this.pushedHomeAds.add(el);
        ads.push({});
      });
    } catch (_) { }
  }


  private readonly STALE_THRESHOLD_MS = 2 * 60_000;

  private loadInitialData(): void {
    const cached = this.postCache.get();

    if (cached?.length) {
      this.allPosts.set(cached);
      this.isLoading.set(false);
      // Cache has all posts - set page count to 1 so computed stats use allPosts directly
      this.serverTotalPages.set(1);
      this.hasMoreOnServer.set(false);
      

      const age = this.postCache.getAge();
      if (age === null || age > this.STALE_THRESHOLD_MS) {
        this.loadFresh(false);
      } else {
        // Cache is fresh, so loadFresh() (which normally pushes the ad slots
        // once data arrives) won't run - push them here instead, otherwise
        // the <ins> elements never get a data-ad-status and .home-ad-wrap
        // stays stuck at its reserved min-height placeholder forever.
        setTimeout(() => this.pushHomeAds(), 300);
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

  trackSponsorClick(postId: string, url: string): void {
    if (!isPlatformBrowser(this.platformId)) return;
    const payload = JSON.stringify({
      postId,
      url,
      referrer:   this.document.referrer || '',
      deviceType: /Mobi|Android/i.test(navigator.userAgent) ? 'mobile' : 'desktop',
      visitorId:  (() => {
        try {
          let vid = localStorage.getItem('_apna_vid');
          if (!vid) { vid = Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem('_apna_vid', vid); }
          return vid;
        } catch { return 'anon'; }
      })(),
    });
    const endpoint = `${environment.apiUrl}/sponsorship/track-click`;
    if (navigator.sendBeacon) {
      navigator.sendBeacon(endpoint, new Blob([payload], { type: 'application/json' }));
    } else {
      fetch(endpoint, { method: 'POST', body: payload, headers: { 'Content-Type': 'application/json' }, keepalive: true }).catch(() => {});
    }
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
    // restore _fullPostPool instantly from cache - no API call needed.
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
        catchError(() => {
          this.filterPoolLoading.set(false);
          this.filterError.set('Could not load all posts. Filter results may be incomplete.');
          return of([] as Post[]);
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((allPosts: Post[]) => {
        this.filterPoolLoading.set(false);
        if (!allPosts.length) return;

        const published  = allPosts.filter(p => p.status === 'published');
        const total      = published.length;
        const totalViews = published.reduce((s, p) => s + ((p as any).views ?? 0), 0);

        // Full post pool - always rebuilt so filtering is always accurate
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
        // Use totalPages for pagination only - serverTotal is set by fetchAccurateStats
        // which counts only published posts (single source of truth for stats)
        this.serverTotalPages.set(totalPages);

        if (showLoader) {
          // Fresh load (no cache) - start with just the first 20
          this.commitPosts(posts);
        } else {
          // Background refresh - merge new posts into existing dataset
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
      // Home page is public - only published posts with quality descriptions
      if (p.status !== 'published') continue;
      if ((p.description ?? '').trim().split(/\s+/).filter(Boolean).length < 12) continue;
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
    this.updateTrendingItemList();

    // Bump max-seen views - all items in visible are already published
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
    // Kept under ~50 chars so it doesn't get truncated in Google search results.
    this.titleService.setTitle('ApnaInsights - Practical Knowledge for Everyday Life');
    this.meta.updateTag({ name: 'description',    content: 'Practical knowledge for everyday life - expert guides on Technology, Career, Health & Business written by verified contributors across India.' });
    this.meta.updateTag({ name: 'keywords',       content: 'practical knowledge India, technology guides India, career tips India, health advice India, business insights, ApnaInsights, everyday life guides' });
    this.meta.updateTag({ name: 'robots',         content: 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1' });
    this.meta.updateTag({ name: 'author',         content: 'ApnaInsights Editorial Team' });
    this.meta.updateTag({ property: 'og:type',         content: 'website' });
    this.meta.updateTag({ property: 'og:title',        content: 'ApnaInsights - Practical Knowledge for Everyday Life' });
    this.meta.updateTag({ property: 'og:description',  content: 'Practical knowledge for everyday life - expert guides on Technology, Career, Health & Business written by verified contributors across India.' });
    this.meta.updateTag({ property: 'og:url',          content: `${site}/` });
    this.meta.updateTag({ property: 'og:site_name',    content: 'ApnaInsights' });
    this.meta.updateTag({ property: 'og:image',        content: og });
    this.meta.updateTag({ property: 'og:image:width',  content: '1200' });
    this.meta.updateTag({ property: 'og:image:height', content: '630' });
    this.meta.updateTag({ property: 'og:image:alt',    content: 'ApnaInsights - Practical Knowledge for Everyday Life' });
    this.meta.updateTag({ property: 'og:locale',       content: 'en_IN' });
    this.meta.updateTag({ name: 'twitter:card',        content: 'summary_large_image' });
    this.meta.updateTag({ name: 'twitter:title',       content: 'ApnaInsights - Practical Knowledge for Everyday Life' });
    this.meta.updateTag({ name: 'twitter:description', content: 'Practical knowledge for everyday life. Expert guides on Technology, Career, Health & Business from verified contributors across India.' });
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
        '@graph': [
          // WebSite - MUST be defined on the homepage for Google's site name feature.
          // Google uses this name field to display "ApnaInsights" next to the logo in
          // search results instead of falling back to the domain "apnainsights.com".
          {
            '@type':     'WebSite',
            '@id':       `${site}/#website`,
            url:         `${site}/`,
            name:        'ApnaInsights',
            description: 'India\'s practical knowledge platform - expert-reviewed guides on Technology, Career, Health & Business.',
            publisher:   { '@id': `${site}/#organization` },
            potentialAction: {
              '@type':       'SearchAction',
              target:        { '@type': 'EntryPoint', urlTemplate: `${site}/search?q={search_term_string}` },
              'query-input': 'required name=search_term_string',
            },
          },
          // Organization - defines the publisher entity referenced by every page's schema.
          {
            '@type':         'Organization',
            '@id':           `${site}/#organization`,
            name:            'ApnaInsights',
            alternateName:   'Apna Insights',
            url:             site,
            logo: {
              '@type':      'ImageObject',
              '@id':        `${site}/#logo`,
              url:          `${site}/logo.png`,
              contentUrl:   `${site}/logo.png`,
              width:        1024,
              height:       1024,
              caption:      'ApnaInsights',
            },
            image:       { '@id': `${site}/#logo` },
            description: 'ApnaInsights is India\'s practical knowledge platform publishing expert-reviewed guides on Technology, Career, Health and Business - written by verified contributors.',
            foundingDate: '2024',
            sameAs: [
              'https://twitter.com/apnainsights',
              'https://linkedin.com/company/apnainsights',
              'https://instagram.com/apnainsights_',
            ],
          },
          {
            '@type':       'CollectionPage',
            '@id':         `${site}/#homepage`,
            url:           `${site}/`,
            name:          'ApnaInsights - Practical Guides on Tech, Career & Life',
            description:   'Browse expert-reviewed guides on Technology, Career, Health & Business - trusted insights from verified contributors across India.',
            inLanguage:    'en-IN',
            isPartOf:      { '@id': `${site}/#website` },
            about:         { '@type': 'Thing', name: 'Practical Knowledge Platform India' },
            publisher:     { '@id': `${site}/#organization` },
            primaryImageOfPage: {
              '@type': 'ImageObject',
              url:     environment.ogImage,
              width:   1200,
              height:  630,
            },
            breadcrumb: {
              '@type': 'BreadcrumbList',
              '@id':   `${site}/#breadcrumb`,
              itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Home', item: `${site}/` }]
            }
          }
        ]
      },
      // FAQ schema - helps Google show rich FAQ snippets in search results
      {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: [
          {
            '@type': 'Question',
            name:    'Is ApnaInsights free to use?',
            acceptedAnswer: {
              '@type': 'Answer',
              text:    'Yes, ApnaInsights is completely free - free to read all guides and articles and free to write and publish your own. No subscription or payment is required.',
            },
          },
          {
            '@type': 'Question',
            name:    'Who can write on ApnaInsights?',
            acceptedAnswer: {
              '@type': 'Answer',
              text:    'Anyone can write on ApnaInsights! Create a free account and start sharing your expertise and insights on topics like Technology, Health, Lifestyle, Career, Sports, Business, and more.',
            },
          },
          {
            '@type': 'Question',
            name:    'What topics can I read about on ApnaInsights?',
            acceptedAnswer: {
              '@type': 'Answer',
              text:    'ApnaInsights covers a wide range of topics including Technology, Health, Sports, Business, Entertainment, Education, Lifestyle, Career, Social Issues, Cooking, Exercise, and more - all written by verified contributors from across India.',
            },
          },
          {
            '@type': 'Question',
            name:    'Can I read articles in Hindi or other Indian languages?',
            acceptedAnswer: {
              '@type': 'Answer',
              text:    'Yes! ApnaInsights supports reading any article in Hindi, Marathi, Tamil, Telugu, Malayalam, and Kannada using the built-in translation feature on every post.',
            },
          },
          {
            '@type': 'Question',
            name:    'How do I get started on ApnaInsights?',
            acceptedAnswer: {
              '@type': 'Answer',
              text:    'Simply visit apnainsights.com, create a free account using your email or Google account, and you can immediately start reading or writing articles and guides. No setup or payment needed.',
            },
          },
          {
            '@type': 'Question',
            name:    'Is ApnaInsights available as a mobile app?',
            acceptedAnswer: {
              '@type': 'Answer',
              text:    'ApnaInsights is a Progressive Web App (PWA). You can install it directly on your Android or iOS device from the browser - no app store download required. It works like a native app with offline support.',
            },
          },
        ],
      },
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

  private updateTrendingItemList(): void {
    const site = environment.siteUrl;
    const top5 = this.byLikes().slice(0, 5) as any[];
    if (!top5.length) return;

    const schema = {
      '@context': 'https://schema.org',
      '@type':    'ItemList',
      name:       'Trending Stories on ApnaInsights',
      description: 'The most-liked knowledge guides and stories on ApnaInsights right now.',
      url:        `${site}/`,
      numberOfItems: top5.length,
      itemListElement: top5.map((p: any, i: number) => ({
        '@type':    'ListItem',
        position:   i + 1,
        url:        `${site}/blog/${p.slug || p._id}`,
        name:       p.title,
        image:      p.featuredImage || environment.ogImage,
        description: p.description || p.title,
      })),
    };

    let el = this.document.getElementById('home-trending-schema') as HTMLScriptElement | null;
    if (!el) {
      el      = this.document.createElement('script') as HTMLScriptElement;
      el.id   = 'home-trending-schema';
      el.type = 'application/ld+json';
      this.document.head.appendChild(el);
    }
    el.textContent = JSON.stringify(schema);
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

  dismissInstallStrip(event: Event): void {
    event.stopPropagation();
    this.installStripDismissed.set(true);
    if (isPlatformBrowser(this.platformId)) {
      sessionStorage.setItem('apna_install_strip_dismissed', '1');
    }
  }

  // Entry point for ALL install triggers.
  triggerInstall(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    if (this.isAndroid()) {
      if (this.canInstallNatively()) {
        // Chrome/Edge/Samsung: fire native PWA prompt immediately - no popup
        this.fireInstallPrompt();
      } else {
        // Other Android browsers: start APK download immediately, then show install guide
        this.startApkDownload();
      }
      return;
    }

    // iOS / desktop - open the modal
    this.showInstallModal.set(true);
  }

  startApkDownload(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    // Trigger download immediately - no popup before this
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
      // Prompt expired - fall back to APK
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

  private loadActiveChallenge(): void {
    this.http.get<any>(`${environment.apiUrl}/challenge`)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: res => {
          const challenges = res.data ?? [];
          this.activeChallenge.set(challenges[0] ?? null);
        },
        error: () => {},
      });
  }

  challengeDaysLeft(endDate: string): number {
    return Math.max(0, Math.ceil((new Date(endDate).getTime() - Date.now()) / 86_400_000));
  }

  private loadFeaturedWinners(): void {
    this.http.get<any>(`${environment.apiUrl}/challenge/featured-winners`)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: res => this.featuredWinners.set(res.data ?? []),
        error: () => {},
      });
  }

  winnerRankLabel(rank: number): string {
    return rank === 1 ? '🥇 1st Place' : rank === 2 ? '🥈 2nd Place' : '🥉 3rd Place';
  }

  navigateToWinner(post: any): void {
    this.router.navigate(['/blog', post.slug || post._id]);
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

  onHeroSearch(event: Event, value: string): void {
    event.preventDefault();
    this.commitHeroSearch(value);
  }

  /** Apply a search term picked from the mega-search dropdown (recent/popular search chip). */
  applyHeroSearchTerm(term: string): void {
    if (this.megaSearchInputEl?.nativeElement) {
      this.megaSearchInputEl.nativeElement.value = term;
    }
    this.commitHeroSearch(term);
  }

  private commitHeroSearch(value: string): void {
    const v = value.trim();
    if (v) this.addRecentSearch(v);
    this.closeHeroSearch();
    this.searchQuery.set(v);
    this.searchInput$.next(v);
    this.resetVisibleCounts();
    if (this.searchInputEl?.nativeElement) {
      this.searchInputEl.nativeElement.value = v;
    }
    this.scrollToResultsPublic();
  }

  // ── Hero "mega search" dropdown ──────────────────────────────────────
  openHeroSearch(): void {
    this.heroSearchOpen.set(true);
  }

  closeHeroSearch(): void {
    this.heroSearchOpen.set(false);
    this.heroDropdownQuery.set('');
  }

  onHeroSearchInput(value: string): void {
    this.heroDropdownQuery.set(value);
    this.heroSearchOpen.set(true);
  }

  /** Clear the mega-search input text without closing the dropdown. */
  clearHeroSearch(): void {
    this.heroDropdownQuery.set('');
    if (this.megaSearchInputEl?.nativeElement) {
      this.megaSearchInputEl.nativeElement.value = '';
      this.megaSearchInputEl.nativeElement.focus();
    }
  }

  selectHeroCategory(cat: string): void {
    this.closeHeroSearch();
    this.selectCategory(cat);
  }

  selectHeroTag(tag: string): void {
    this.closeHeroSearch();
    this.selectTag(tag);
  }

  /** Smooth-scroll a section of the open dropdown into view (for the quick-action chips). */
  scrollDropdownTo(sectionClass: string): void {
    if (!isPlatformBrowser(this.platformId)) return;
    setTimeout(() => {
      this.document.querySelector(`.v2-mega-dropdown .${sectionClass}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 0);
  }

  private addRecentSearch(term: string): void {
    const trimmed = term.trim();
    if (!trimmed) return;
    const next = [trimmed, ...this.recentSearches().filter(s => s.toLowerCase() !== trimmed.toLowerCase())].slice(0, 5);
    this.recentSearches.set(next);
    writeRecentSearches(next);
  }

  removeRecentSearch(term: string): void {
    const next = this.recentSearches().filter(s => s !== term);
    this.recentSearches.set(next);
    writeRecentSearches(next);
  }

  clearRecentSearches(): void {
    this.recentSearches.set([]);
    writeRecentSearches([]);
  }

  scrollToResultsPublic(): void {
    setTimeout(() => this.scrollToResults(), 300);
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
    this.setQueryParams(next ? { category: next } : {});
    this.scrollToResults();
  }

  private resetVisibleCounts(): void {
    this.filteredPage.set(0);
    this.filteredVisibleCount.set(PAGE_SIZE);
  }

  // Centralized scroll helper - call after ANY action that changes the
  // visible feed (search submit/clear, category/tag/sort/filter change,
  // mobile tab switch) so the user always sees the updated results, no
  // matter where they're currently scrolled. `.filter-wrap` sits directly
  // above every feed section (#filtered-results, trending, most-viewed,
  // latest, etc.), so it's a single stable anchor for "start of results"
  // in every state. `scroll-margin-top` on `.filter-wrap` (home.css)
  // accounts for the sticky header so it isn't hidden underneath it.
  private scrollToResults(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    // Wait for Angular to finish rendering the updated feed before scrolling.
    setTimeout(() => {
      this.document.querySelector('.filter-wrap')
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
  }

  clearAllFilters(): void {
    this.selectedCategory.set('');
    this.selectedTag.set('');
    this.selectedReadingTime.set('');
    this.selectedSort.set('newest');
    this.searchQuery.set('');
    if (this.searchInputEl?.nativeElement) {
      this.searchInputEl.nativeElement.value = '';
    }
    this.resetVisibleCounts();
    this.setQueryParams({});
    this.scrollToResults();
  }

  activeFilterLabel = computed(() => {
    if (this.selectedCategory()) return this.selectedCategory();
    if (this.selectedTag())      return '#' + this.selectedTag();
    if (this.searchQuery().trim()) return '"' + this.searchQuery().trim() + '"';
    if (this.selectedReadingTime()) {
      const map: Record<string, string> = { quick: '≤4 min', medium: '5–9 min', long: '10+ min' };
      return map[this.selectedReadingTime()] ?? this.selectedReadingTime();
    }
    return '';
  });

  // Update URL without triggering Angular Router navigation (and its scrollPositionRestoration
  // which fires on NavigationEnd and undoes our smooth scroll with replaceUrl:true).
  // When applying a filter for the first time, push a history entry so the back button
  // clears the filter and restores scroll position.
  private setQueryParams(params: Record<string, string>): void {
    const url = this.router.serializeUrl(
      this.router.createUrlTree([], { relativeTo: this.route, queryParams: params })
    );
    const isApplyingFilter = Object.keys(params).length > 0;
    const hasExistingFilter = isPlatformBrowser(this.platformId) &&
      /[?&](category|tag|rt|q)=/.test(window.location.search);

    if (isApplyingFilter && !hasExistingFilter && isPlatformBrowser(this.platformId)) {
      window.history.pushState({}, '', url);
    } else {
      this.location.replaceState(url);
    }
  }

  selectTag(tag: string): void {
    const next = this.selectedTag() === tag ? '' : tag;
    this.selectedTag.set(next);
    this.resetVisibleCounts();
    this.setQueryParams(next ? { tag: next } : {});
    this.scrollToResults();
  }

  selectReadingTime(rt: '' | 'quick' | 'medium' | 'long'): void {
    const next = this.selectedReadingTime() === rt ? '' : rt;
    this.selectedReadingTime.set(next);
    this.resetVisibleCounts();
    this.setQueryParams(next ? { rt: next } : {});
    this.scrollToResults();
  }

  // Used by <select> elements - sets directly (no toggle)
  onTagSelectChange(tag: string): void {
    this.selectedTag.set(tag);
    this.resetVisibleCounts();
    this.setQueryParams(tag ? { tag } : {});
    this.scrollToResults();
  }

  onTimeSelectChange(rt: string): void {
    this.selectedReadingTime.set(rt as any);
    this.resetVisibleCounts();
    this.setQueryParams(rt ? { rt } : {});
    this.scrollToResults();
  }

  onSortChange(sort: string): void {
    this.selectedSort.set(sort);
    this.resetVisibleCounts();
    this.scrollToResults();
  }

  // Switch the mobile "For You / Trending / Latest" tab and bring the feed
  // into view - each tab shows different sections, so without this the user
  // could be scrolled past the content the new tab actually has to show.
  setMobileTab(tab: 'for-you' | 'trending' | 'latest'): void {
    this.mobileTab.set(tab);
    this.scrollToResults();
  }

  prevPage(page: WritableSignal<number>): void {
    if (page() > 0) { page.update(p => p - 1); scrollTo({ top: 0, behavior: 'smooth' }); }
  }

  nextPage(page: WritableSignal<number>, total: number): void {
    if (page() < total - 1) {
      page.update(p => p + 1);
      scrollTo({ top: 0, behavior: 'smooth' });
    }
    // Last page of memory - transparently fetch more from server
    if (page() >= total - 2 && this.hasMoreOnServer()) {
      this.loadNextServerPage();
    }
  }

  readBlog(id: string): void {
    if (isPlatformBrowser(this.platformId)) {
      const post = this.allPosts().find(p => p._id === id || (p as any).slug === id);
      if (post) {
        // Sponsored posts go to the dedicated campaign page, not the blog article
        if ((post as any).isSponsored) {
          this.router.navigate(['/campaign', post._id]);
          return;
        }
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