import {
  Component, inject, signal, computed, OnInit, OnDestroy, DestroyRef,
  Input, HostBinding, ChangeDetectionStrategy, PLATFORM_ID, HostListener, WritableSignal, effect,
} from '@angular/core';
import { environment } from '../../../../../environments/environment';
import { ActivatedRoute, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { CommonModule, isPlatformBrowser, DOCUMENT } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { DomSanitizer, Meta, SafeHtml, Title } from '@angular/platform-browser';
import { of, catchError } from 'rxjs';
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
import { GetAppModal } from '../get-app.modal';
import { BirthdayPopup, isBirthdayEventActiveToday } from '../../../../shared/birthday-popup/birthday-popup';
import { FormatCountPipe } from '../../../../shared/pipes/format-count-pipe';
import { TimeAgoPipe }     from '../../../../shared/pipes/time-ago-pipe';
import { CloudinaryResizePipe } from '../../../../shared/pipes/cloudinary-resize-pipe';
import { MobileBottomNav } from '../../../../shared/mobile-bottom-nav/mobile-bottom-nav';
import { PostCache, PostWithTs } from '../../../post/services/post-cache';
import { ReadingHistory }        from '../../../../core/services/reading-history';
import { TaxonomyService }       from '../../../../core/services/taxonomy.service';
import { categoryColorFor as sharedCategoryColorFor } from '../../../../shared/utils/category-color';
import { BookmarkService }       from '../../../../core/services/bookmark.service';
import { AllPostsCache }         from '../../../../core/services/all-posts-cache';
import { NotificationPanel }     from '../../../../shared/components/notification-panel/notification-panel';
import { PanelCoordinator }      from '../../../../core/services/panel-coordinator';

const FETCH_LIMIT = 20;   // posts fetched for the homepage's ranked sections
const PAGE_SIZE    = 8;   // items shown in the Trending/Editor's Picks rails
const SHORTS_LIMIT  = 6;  // items shown in the Shorts rail

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [
    RouterLink, RouterLinkActive, CommonModule, FormsModule,
    WelcomeModal, GetAppModal, BirthdayPopup, FormatCountPipe, TimeAgoPipe, CloudinaryResizePipe,
    MobileBottomNav, NotificationPanel,
  ],
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
  // Bookmark UI was removed from the homepage (see plan), but this is still
  // the only place in the app that calls syncFromServer() to hydrate the
  // shared bookmarked-ids signal other pages (blog-detail, /bookmarks) read -
  // dropping the injection entirely would silently break bookmark state
  // hydration app-wide, so it stays wired here with zero homepage UI.
  private bookmarkService = inject(BookmarkService);
  private destroyRef     = inject(DestroyRef);
  private route          = inject(ActivatedRoute);
  private router         = inject(Router);
  private auth           = inject(Auth);
  private http           = inject(HttpClient);
  private userService    = inject(UserService);
  themeService           = inject(ThemeService);
  private platformId     = inject(PLATFORM_ID);
  private meta           = inject(Meta);
  private sanitizer      = inject(DomSanitizer);
  private titleService   = inject(Title);
  private document       = inject(DOCUMENT);
  private coordinator    = inject(PanelCoordinator);

  constructor() {
    effect(() => { if (this.headerSearchOpen()) this.coordinator.open('search'); });
    effect(() => { if (this.profileMenuOpen())  this.coordinator.open('profile'); });
    effect(() => { if (this.navCatOpen())       this.coordinator.open('categories'); });
    effect(() => { if (this.menuOpen())         this.coordinator.open('mobile-menu'); });

    this.coordinator.active$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(active => {
        if (active !== 'search')      this.headerSearchOpen.set(false);
        if (active !== 'profile')     this.profileMenuOpen.set(false);
        if (active !== 'categories')  this.navCatOpen.set(false);
        if (active !== 'mobile-menu') this.menuOpen.set(false);
      });
  }

  @Input() standalone = true;
  @HostBinding('class.mode-embedded') get isEmbedded() { return !this.standalone; }

  allPosts  = signal<PostWithTs[]>([]);
  isLoading = signal(true);
  menuOpen  = signal(false);

  showWelcomeModal = signal(false);
  showGetAppModal  = signal(false);
  private welcomeTimerId: ReturnType<typeof setTimeout> | null = null;

  navCatOpen  = signal(false);

  // Header search: an inline dropdown for desktop instead of redirecting to
  // a separate page before the user has typed anything.
  headerSearchOpen  = signal(false);
  headerSearchQuery = signal('');
  // Searched against the site-wide megaMenuPublishedPosts() pool (loaded via
  // allPostsCache), not the FETCH_LIMIT-capped allPosts() homepage rail data -
  // otherwise an author/title only present outside the latest 20 homepage
  // posts would silently never match here despite matching on /blog.
  headerSearchSuggestions = computed(() => {
    const q = this.headerSearchQuery().trim().toLowerCase();
    if (!q) return [];
    return this.megaMenuPublishedPosts().filter(p =>
      p.title.toLowerCase().includes(q) ||
      ((p.user as any)?.name ?? '').toLowerCase().includes(q)
    ).slice(0, 6);
  });
  headerSearchCategoryMatches = computed(() => {
    const q = this.headerSearchQuery().trim().toLowerCase();
    if (!q) return [];
    return this.categories().filter(c => c.toLowerCase().includes(q)).slice(0, 4);
  });
  selectHeaderCategory(cat: string): void {
    this.headerSearchOpen.set(false);
    this.headerSearchQuery.set('');
    this.router.navigate(['/category', cat.toLowerCase()]);
  }
  toggleHeaderSearch(): void {
    this.headerSearchOpen.update(v => !v);
  }
  submitHeaderSearch(): void {
    const q = this.headerSearchQuery().trim();
    if (!q) return;
    this.router.navigate(['/blog'], { queryParams: { q } });
    this.headerSearchOpen.set(false);
    this.headerSearchQuery.set('');
  }
  selectHeaderSuggestion(postId: string): void {
    this.headerSearchOpen.set(false);
    this.headerSearchQuery.set('');
    this.readBlog(postId);
  }
  getAuthorName(post: Post): string { return (post.user as any)?.name ?? 'Anonymous'; }

  homeShorts = signal<VideoShort[]>([]);

  // Left scroll-arrow only appears once a rail has been scrolled away from
  // its start - showing it at rest implies there's content to the left when
  // there isn't.
  chipRailAtStart   = signal(true);
  trendRailAtStart  = signal(true);
  shortsRailAtStart = signal(true);
  onRailScroll(el: HTMLElement, atStart: WritableSignal<boolean>): void {
    atStart.set(el.scrollLeft <= 4);
  }

  private currentUserData = signal<User | null>(null);

  readonly skeletonItems: null[] = new Array(4).fill(null);
  readonly shortsSkeletonItems: null[] = new Array(SHORTS_LIMIT).fill(null);

  // Curated subset (not the full live categories() list, which runs to 14+)
  // so the footer's Categories column stays roughly the same length as
  // Explore/Company instead of dwarfing them.
  readonly footerCategories: string[] = ['Technology', 'Career', 'Business', 'Health', 'Lifestyle', 'News'];

  // Fallback list used before taxonomy API responds (avoids empty UI flash)
  private readonly FALLBACK_CATEGORIES = [
    'Technology', 'Career', 'Business', 'Health', 'Lifestyle',
    'Education', 'Sports', 'News',
  ];

  categories = computed<string[]>(() => {
    const names = this.taxonomyService.categoryNames();
    return names.length ? names : this.FALLBACK_CATEGORIES;
  });

  // Site-wide published post set (not the FETCH_LIMIT-capped allPosts() used
  // by the homepage rails) so the nav's category mega-menu shows the same
  // live per-category counts as site-header.ts's identical dropdown on
  // /blog, /category, /author and /tag.
  private megaMenuPosts = signal<Post[]>([]);
  private megaMenuPublishedPosts = computed<Post[]>(() =>
    this.megaMenuPosts().filter(p => p.status === 'published' && !p.isSponsored)
  );
  categoryRows = computed<{ name: string; slug: string; count: number }[]>(() => {
    const posts = this.megaMenuPublishedPosts();
    return this.categories().map(name => ({
      name,
      slug: name.toLowerCase(),
      count: posts.filter(p => p.categories?.some(c => c.toLowerCase() === name.toLowerCase())).length,
    }));
  });

  // Flat line-art SVGs, not emoji - a taxonomy-driven emoji map was
  // considered here but emoji glyphs render with an inconsistent,
  // often glossy/3D style across platforms (Apple's emoji font especially),
  // which clashes with the rest of the flat, stroke-based icon language
  // used everywhere else on the card/chip UI. Same SVG set as
  // category-page.ts's ICONS map and search.ts's CATEGORY_ICONS, kept in
  // sync there - a category not in this map still falls back to a plain
  // circle rather than reintroducing an emoji.
  private static readonly CATEGORY_ICON_SVGS: Record<string, string> = {
    Technology:    `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>`,
    Health:        `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`,
    Sports:        `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="6"/><path d="M15.477 12.89L17 22l-5-3-5 3 1.523-9.11"/></svg>`,
    Business:      `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/></svg>`,
    Lifestyle:     `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`,
    Education:     `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>`,
    Entertainment: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="2.18"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="2" y1="7" x2="7" y2="7"/><line x1="2" y1="17" x2="7" y2="17"/><line x1="17" y1="17" x2="22" y2="17"/><line x1="17" y1="7" x2="22" y2="7"/></svg>`,
    Village:       `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`,
    Social:        `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
    Exercise:      `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>`,
    News:          `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>`,
    Update:        `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>`,
    Career:        `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>`,
    AI:            `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/><line x1="9" y1="20" x2="9" y2="23"/><line x1="15" y1="20" x2="15" y2="23"/><line x1="20" y1="9" x2="23" y2="9"/><line x1="20" y1="14" x2="23" y2="14"/><line x1="1" y1="9" x2="4" y2="9"/><line x1="1" y1="14" x2="4" y2="14"/></svg>`,
    Finance:       `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>`,
    Productivity:  `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>`,
  };
  private static readonly DEFAULT_CATEGORY_ICON_SVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/></svg>`;
  private static readonly ALL_CHIP_ICON_SVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V9.5z"/><path d="M9 21V12h6v9"/></svg>`;

  private categoryIconCache = new Map<string, SafeHtml>();
  categoryIconSvg(cat: string): SafeHtml {
    let icon = this.categoryIconCache.get(cat);
    if (!icon) {
      const svg = Home.CATEGORY_ICON_SVGS[cat] ?? Home.DEFAULT_CATEGORY_ICON_SVG;
      icon = this.sanitizer.bypassSecurityTrustHtml(svg);
      this.categoryIconCache.set(cat, icon);
    }
    return icon;
  }
  allChipIcon: SafeHtml = this.sanitizer.bypassSecurityTrustHtml(Home.ALL_CHIP_ICON_SVG);

  // Small color cue per category chip (icon dot background). Named
  // categories get a fixed, intentional hue; anything else falls back to a
  // deterministic hash into the same palette so it's still distinct and
  // consistent across renders instead of just defaulting to grey.
  categoryColorFor(name: string): string {
    return sharedCategoryColorFor(name);
  }

  // ── Small inline stat icons reused 3+ times across the Featured / Latest
  // Articles / Trending / Shorts card shapes (eye = views, clock = read
  // time, play = shorts). Same hand-copied-SVG + SafeHtml-cache pattern as
  // categoryIconSvg() above - one-off header icons (flame, crown, star) are
  // written inline at their single usage site instead.
  private static readonly STAT_ICON_SVGS = {
    eye:   `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`,
    heart: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`,
    clock: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
    play:  `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`,
  } as const;
  private statIconCache = new Map<string, SafeHtml>();
  statIcon(key: keyof typeof Home.STAT_ICON_SVGS): SafeHtml {
    let icon = this.statIconCache.get(key);
    if (!icon) {
      icon = this.sanitizer.bypassSecurityTrustHtml(Home.STAT_ICON_SVGS[key]);
      this.statIconCache.set(key, icon);
    }
    return icon;
  }

  private readingTimeCache = new Map<string, number>();

  // Editorial-only posts - sponsored content has its own dedicated
  // placement elsewhere and must not appear in these ranked homepage rails.
  private editorialPosts = computed(() => this.allPosts().filter(p => !p.isSponsored));

  // "Trending" - ranked by the time-decayed hotScore (refreshed on every
  // like/comment/view) so the list shifts day to day as engagement changes,
  // instead of being pinned to all-time likesCount. Falls back to
  // likesCount for posts whose hotScore hasn't been computed yet.
  private byLikes = computed(() => {
    const all = this.editorialPosts();
    const score = (p: PostWithTs) => (p.hotScore || p.likesCount);
    return [...all].sort((a, b) => score(b) - score(a));
  });
  private byViews = computed(() => [...this.editorialPosts()].sort((a, b) => b.views - a.views));
  private byDate  = computed(() => [...this.editorialPosts()].sort((a, b) => b._ts - a._ts));

  trendingPosts   = computed(() => this.byLikes().slice(0, PAGE_SIZE));
  hotPosts        = computed(() => this.byViews().slice(0, PAGE_SIZE));
  latestArticles  = computed(() => this.byDate().slice(0, 4));
  // Editor's Picks rail only ever shows 3 - thin wrapper around hotPosts()
  // the same way latestArticles() wraps byDate(), rather than slicing
  // inline in the template.
  editorPicks     = computed(() => this.hotPosts().slice(0, 3));

  // Hero "Featured Story" card - highest-engagement post that isn't already
  // one of the items shown in the Trending rail below it. Uses byLikes
  // (same ranking as Trending) rather than most-recent-by-date, since
  // recency alone can surface an unvetted/off-topic post as the showcase.
  featuredArticle = computed(() => {
    const ranked = this.byLikes();
    const shownIds = new Set(this.trendingPosts().map(p => p._id));
    return ranked.find(p => !shownIds.has(p._id)) ?? ranked[0] ?? null;
  });

  // Sponsored posts' "dedicated placement" (see editorialPosts() above) -
  // fetched separately via GET /post/sponsored rather than filtered out of
  // allPosts(), since that endpoint guarantees active campaigns show up
  // regardless of the paginated feed window. Client-only fetch (like
  // loadMegaMenuPosts()) since this is marked noindex/non-SEO-critical, and
  // it keeps a sponsoredUntil-expired campaign from ever getting frozen into
  // the prerendered HTML even before app.config.ts's transfer-cache filter
  // would catch it.
  sponsoredPosts = signal<Post[]>([]);
  private loadSponsoredPosts(): void {
    this.postService.getSponsoredPosts()
      .pipe(catchError(() => of({ status: 200, data: [] as Post[] })), takeUntilDestroyed(this.destroyRef))
      .subscribe(res => this.sponsoredPosts.set(res.data ?? []));
  }

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

  // Use synchronous auth signals (localStorage) so links route correctly
  // even before the API call resolves - avoids the timing gap where
  // isLoggedIn=false while the token is valid but currentUserData() is
  // still null.
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

  get dashboardRoute(): string { return this.writeRoute; }

  get currentUser(): User | null    { return this.currentUserData(); }
  get isLoggedIn(): boolean         { return this.auth.isAuthorized() && !!this.currentUserData(); }
  get loggedInFirstName(): string   { return this.currentUserData()?.name?.split(' ')[0] ?? 'Me'; }
  get loggedInAvatar(): string      { return (this.currentUserData() as any)?.avatar ?? ''; }
  get loggedInInitials(): string {
    const parts = (this.currentUserData()?.name ?? 'Me').trim().split(/\s+/);
    const first = parts[0]?.[0] ?? '';
    const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
    return (first + last).toUpperCase() || 'ME';
  }

  profileMenuOpen = signal(false);
  toggleProfileMenu(): void { this.profileMenuOpen.update(v => !v); }
  logout(): void {
    this.profileMenuOpen.set(false);
    this.auth.logout();
    this.router.navigate(['/']);
  }

  // Hover-to-open (matching site-header.ts's mega-menu), with a short close
  // delay so moving the mouse from the trigger down into the panel itself
  // doesn't clip it shut. Click still works underneath for touch/keyboard.
  private navCatCloseTimer: ReturnType<typeof setTimeout> | null = null;
  openNavCat(): void {
    if (this.navCatCloseTimer) { clearTimeout(this.navCatCloseTimer); this.navCatCloseTimer = null; }
    this.navCatOpen.set(true);
  }
  scheduleCloseNavCat(): void {
    if (this.navCatCloseTimer) clearTimeout(this.navCatCloseTimer);
    this.navCatCloseTimer = setTimeout(() => this.navCatOpen.set(false), 220);
  }

  @HostListener('document:click', ['$event'])
  onDocClick(e: MouseEvent): void {
    const t = e.target as HTMLElement;
    if (!t.closest('.nav-cat-wrap')) this.navCatOpen.set(false);
    if (!t.closest('.hp-header-search-wrap')) this.headerSearchOpen.set(false);
    if (!t.closest('.hp-profile-menu-wrap')) this.profileMenuOpen.set(false);
  }

  @HostListener('document:keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      if (this.menuOpen())   this.menuOpen.set(false);
      if (this.navCatOpen()) this.navCatOpen.set(false);
      if (this.showWelcomeModal()) this.dismissWelcomeModal();
    }
  }

  ngOnInit(): void {
    this.standalone = this.route.snapshot.data['standalone'] ?? this.standalone;
    this.setMetaTags();
    this.injectJsonLd();

    this.bookmarkService.syncFromServer();

    if (isPlatformBrowser(this.platformId)) {
      const alreadySeen = sessionStorage.getItem('apna_welcome_seen');
      if (!alreadySeen && !isBirthdayEventActiveToday()) {
        const delay = 2000 + Math.random() * 1000;
        this.welcomeTimerId = setTimeout(() => {
          if (window.innerWidth >= 768) this.showWelcomeModal.set(true);
        }, delay);
      }

      // Chrome/Edge (desktop + Android) fire this ~automatically once the
      // manifest/service-worker install criteria are met; capturing it lets
      // us trigger the native install UI from our own button instead of
      // waiting for the browser's own address-bar icon.
      //
      // index.html attaches its own listener before Angular boots (so no
      // installability window is missed) and stashes the event on
      // window.__pwaPrompt - by the time this component initializes, the
      // event has usually already fired and this listener alone would never
      // see it, so pick up whatever index.html already captured too.
      const earlyPrompt = (window as any).__pwaPrompt;
      if (earlyPrompt) this.installPromptEvent.set(earlyPrompt);

      window.addEventListener('beforeinstallprompt', (e: Event) => {
        e.preventDefault();
        this.installPromptEvent.set(e);
      });
      window.addEventListener('appinstalled', () => this.installPromptEvent.set(null));

      // Mega-menu category counts are nav-only UI, not SEO/SSR-critical content,
      // and `/post?...limit=` is excluded from the transfer cache (see app.config.ts)
      // so an SSR-side fetch here is discarded and re-fetched by the browser anyway -
      // running it only on the client cuts this from 4 backend round trips to 2.
      this.loadMegaMenuPosts();
      this.loadSponsoredPosts();
    }

    this.loadInitialData();
    this.taxonomyService.load().pipe(takeUntilDestroyed(this.destroyRef)).subscribe();
  }

  private loadMegaMenuPosts(): void {
    const cached = this.allPostsCache.get();
    if (cached.length) {
      this.megaMenuPosts.set(cached);
      return;
    }
    this.postService.getAllPublished()
      .pipe(catchError(() => of([] as Post[])), takeUntilDestroyed(this.destroyRef))
      .subscribe(posts => {
        this.allPostsCache.set(posts);
        this.megaMenuPosts.set(posts);
      });
  }

  installPromptEvent = signal<any>(null);
  canInstall = computed(() => !!this.installPromptEvent());
  async installApp(): Promise<void> {
    const evt = this.installPromptEvent();
    if (!evt) return;
    evt.prompt();
    await evt.userChoice;
    this.installPromptEvent.set(null);
  }

  // Skip the "Get the App" modal entirely when the browser can already show
  // its own native install popup (Chrome/Edge on Android/desktop) - only
  // fall back to the modal (APK download / iOS steps) when that's not
  // available.
  onGetAppClick(): void {
    if (this.canInstall()) {
      this.installApp();
    } else {
      this.showGetAppModal.set(true);
    }
  }

  ngOnDestroy(): void {
    if (this.welcomeTimerId !== null) {
      clearTimeout(this.welcomeTimerId);
      this.welcomeTimerId = null;
    }
    if (this.navCatCloseTimer) {
      clearTimeout(this.navCatCloseTimer);
      this.navCatCloseTimer = null;
    }
    this.readingTimeCache.clear();
    const scripts = this.document.querySelectorAll('script[data-apna-home-schema]');
    scripts.forEach(s => s.remove());
    this.document.getElementById('home-trending-schema')?.remove();
  }

  private readonly STALE_THRESHOLD_MS = 2 * 60_000;

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
    this.loadHomeShorts();
  }

  private loadFresh(showLoader: boolean): void {
    if (showLoader) this.isLoading.set(true);

    this.postService.getAllPost(1, FETCH_LIMIT)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        catchError(() => {
          this.isLoading.set(false);
          return of(null);
        })
      )
      .subscribe(res => {
        if (!res) return;
        const posts: Post[] = res.data || [];
        if (showLoader) {
          this.commitPosts(posts);
        } else {
          this.commitPosts([...this.allPosts(), ...posts]);
        }
        this.isLoading.set(false);
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
  }

  private loadHomeShorts(): void {
    this.shortsService.getShorts(1, SHORTS_LIMIT)
      .pipe(takeUntilDestroyed(this.destroyRef), catchError(() => of({ status: 200, data: [], total: 0, page: 1, totalPages: 1 })))
      .subscribe(res => {
        // Sponsored-first client-side so paid placements keep prime
        // position on the rail without a separate "sponsored" section.
        const sorted = [...(res.data ?? [])].sort(
          (a, b) => (b.isSponsored ? 1 : 0) - (a.isSponsored ? 1 : 0)
        );
        this.homeShorts.set(sorted.slice(0, SHORTS_LIMIT));
      });
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
              target:        { '@type': 'EntryPoint', urlTemplate: `${site}/blog?q={search_term_string}` },
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

  getReadingTime(post: Post): number {
    if (this.readingTimeCache.has(post._id)) return this.readingTimeCache.get(post._id)!;
    let time = post.readingTimeMinutes;
    if (!time) {
      const text = (post as any).content?.replace(/<[^>]*>/g, '') ?? post.description ?? '';
      time = Math.max(1, Math.ceil(text.trim().split(/\s+/).length / 200));
    }
    this.readingTimeCache.set(post._id, time);
    return time;
  }

  /** Below this, showing the raw count reads as "low traffic" rather than useful info - so hide it instead. */
  private static readonly MIN_VISIBLE_VIEWS = 100;
  hasMeaningfulViews(n: number | undefined | null): boolean {
    return (n ?? 0) >= Home.MIN_VISIBLE_VIEWS;
  }

  // The category chip rail / dropdown navigate to the dedicated category
  // page rather than filtering in place - the homepage no longer has a
  // unified feed underneath it for `selectedCategory` to filter (see plan:
  // sort/filter/infinite-feed machinery removed), so "select a category"
  // now means "go read that category's page".
  selectCategory(cat: string): void {
    this.navCatOpen.set(false);
    this.router.navigate(['/category', cat.toLowerCase()]);
  }

  readBlog(id: string): void {
    if (isPlatformBrowser(this.platformId)) {
      const post = this.allPosts().find(p => p._id === id || (p as any).slug === id)
        ?? this.megaMenuPosts().find(p => p._id === id || (p as any).slug === id);
      if (post) this.readingHistory.add(post);
    }
    this.router.navigate(['/blog', id]);
  }

  trackByPostId(_index: number, post: Post): string { return post._id; }
  trackByCategory(_index: number, cat: string): string { return cat; }
  trackByShortId(_index: number, short: VideoShort): string { return short._id; }
}
