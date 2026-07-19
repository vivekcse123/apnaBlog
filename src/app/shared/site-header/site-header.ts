import {
  Component, OnInit, OnDestroy, inject, signal, computed, DestroyRef, PLATFORM_ID,
  ChangeDetectionStrategy, HostListener, effect,
} from '@angular/core';
import { RouterLink, RouterLinkActive, Router } from '@angular/router';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError } from 'rxjs/operators';
import { of } from 'rxjs';
import { PostService } from '../../features/post/services/post-service';
import { AllPostsCache } from '../../core/services/all-posts-cache';
import { TaxonomyService } from '../../core/services/taxonomy.service';
import { Post } from '../../core/models/post.model';
import { Auth } from '../../core/services/auth';
import { ThemeService } from '../../core/services/theme-service';
import { NotificationPanel } from '../components/notification-panel/notification-panel';
import { UserService } from '../../features/user/services/user-service';
import { User } from '../../features/user/models/user.mode';
import { PanelCoordinator } from '../../core/services/panel-coordinator';
import { categoryColorFor as sharedCategoryColorFor } from '../utils/category-color';

const FALLBACK_CATEGORIES: string[] = [
  'Update', 'News', 'Sports', 'Entertainment', 'Health', 'Technology', 'Business',
  'Lifestyle', 'Education', 'Exercise', 'Social', 'Village',
  'Career', 'AI', 'Finance', 'Productivity',
];

interface CategoryRow {
  name: string;
  slug: string;
  count: number;
}

// Shared top nav used by /blog, /category/:x, /author/:id and /tag/:x - the
// single header referenced across those pages so nav, search and auth state
// look and behave identically no matter which of them a visitor lands on.
// (Deliberately NOT used on the homepage - that header has homepage-specific
// concerns like the app-install prompt and its own mobile drawer.)
@Component({
  selector: 'app-site-header',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RouterLinkActive, CommonModule, NotificationPanel],
  templateUrl: './site-header.html',
  styleUrl: './site-header.css',
})
export class SiteHeader implements OnInit, OnDestroy {
  private postService     = inject(PostService);
  private allPostsCache   = inject(AllPostsCache);
  private taxonomyService = inject(TaxonomyService);
  private sanitizer       = inject(DomSanitizer);
  private destroyRef      = inject(DestroyRef);
  private platformId      = inject(PLATFORM_ID);
  private auth            = inject(Auth);
  private router          = inject(Router);
  private userService     = inject(UserService);
  private coordinator     = inject(PanelCoordinator);
  themeService              = inject(ThemeService);

  constructor() {
    effect(() => { if (this.showHeaderSearch())   this.coordinator.open('search'); });
    effect(() => { if (this.profileMenuOpen())    this.coordinator.open('profile'); });
    effect(() => { if (this.showMoreCategories()) this.coordinator.open('categories'); });
    effect(() => { if (this.menuOpen())           this.coordinator.open('mobile-menu'); });

    this.coordinator.active$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(active => {
        if (active !== 'search')      this.showHeaderSearch.set(false);
        if (active !== 'profile')     this.profileMenuOpen.set(false);
        if (active !== 'categories')  this.showMoreCategories.set(false);
        if (active !== 'mobile-menu') this.menuOpen.set(false);
      });
  }

  // auth.userName() is only ever populated if the login response itself
  // includes a `name` field - it often doesn't, leaving it null even for a
  // freshly-logged-in session. Fetching the full profile (same call
  // home.ts's currentUserData makes) is the reliable source for display name.
  private currentUserData = signal<User | null>(null);
  private fetchCurrentUser(): void {
    const userId = this.auth.userId();
    if (!userId) return;
    this.userService.getUserById(userId)
      .pipe(takeUntilDestroyed(this.destroyRef), catchError(() => of({ data: null })))
      .subscribe(res => this.currentUserData.set(res.data ?? null));
  }

  get isLoggedIn(): boolean { return this.auth.isAuthorized(); }
  get loggedInFirstName(): string {
    return this.currentUserData()?.name?.split(' ')[0] || (this.auth.userName() ?? '').split(' ')[0] || 'You';
  }
  get loggedInInitials(): string {
    const name = this.currentUserData()?.name || this.auth.userName() || 'You';
    const parts = name.trim().split(/\s+/);
    const first = parts[0]?.[0] ?? '';
    const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
    return (first + last).toUpperCase() || 'ME';
  }
  get loggedInAvatar(): string { return (this.currentUserData() as any)?.avatar ?? ''; }

  profileMenuOpen = signal(false);
  toggleProfileMenu(): void { this.profileMenuOpen.update(v => !v); }
  logout(): void {
    this.profileMenuOpen.set(false);
    this.auth.logout();
    this.router.navigate(['/']);
  }

  get dashboardRoute(): string {
    const id   = this.auth.userId();
    const role = this.auth.userRole();
    if (!id) return '/auth/login';
    if (role === 'admin')       return `/admin/${id}`;
    if (role === 'super_admin') return `/super-admin/${id}`;
    if (role === 'sponsor')     return `/sponsor/${id}`;
    return `/user/${id}`;
  }

  private readonly ICONS: Record<string, string> = {
    Technology:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>`,
    Health:        `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`,
    Sports:        `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="6"/><path d="M15.477 12.89L17 22l-5-3-5 3 1.523-9.11"/></svg>`,
    Business:      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/></svg>`,
    Lifestyle:     `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`,
    Education:     `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>`,
    Entertainment: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="2.18"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="2" y1="7" x2="7" y2="7"/><line x1="2" y1="17" x2="7" y2="17"/><line x1="17" y1="17" x2="22" y2="17"/><line x1="17" y1="7" x2="22" y2="7"/></svg>`,
    Village:       `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`,
    Social:        `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
    Exercise:      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>`,
    News:          `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>`,
    Update:        `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>`,
    Career:        `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>`,
    AI:            `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/><line x1="9" y1="20" x2="9" y2="23"/><line x1="15" y1="20" x2="15" y2="23"/><line x1="20" y1="9" x2="23" y2="9"/><line x1="20" y1="14" x2="23" y2="14"/><line x1="1" y1="9" x2="4" y2="9"/><line x1="1" y1="14" x2="4" y2="14"/></svg>`,
    Finance:       `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>`,
    Productivity:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>`,
  };
  private readonly DEFAULT_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/></svg>`;

  getCategoryIcon(name: string): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(this.ICONS[name] ?? this.DEFAULT_ICON);
  }

  categoryColor(name: string): string {
    return sharedCategoryColorFor(name);
  }

  private allPosts = signal<Post[]>([]);
  private publishedPosts = computed<Post[]>(() =>
    this.allPosts().filter(p => p.status === 'published' && !p.isSponsored)
  );

  ALL_CATEGORIES = computed<string[]>(() => {
    const names = this.taxonomyService.categoryNames();
    return names.length ? names : FALLBACK_CATEGORIES;
  });

  // Same order as home.ts's categories() - raw taxonomy order, not sorted by
  // count - so the nav dropdown matches the homepage's list exactly.
  categoryRows = computed<CategoryRow[]>(() => {
    const posts = this.publishedPosts();
    return this.ALL_CATEGORIES()
      .map(name => ({
        name,
        slug: name.toLowerCase(),
        count: posts.filter(p => p.categories?.some(c => c.toLowerCase() === name.toLowerCase())).length,
      }));
  });

  showMoreCategories = signal(false);
  showHeaderSearch    = signal(false);
  searchQuery         = signal('');
  menuOpen            = signal(false);

  private headerSearchMatches = computed<Post[]>(() => {
    const q = this.searchQuery().trim().toLowerCase();
    if (!q) return [];
    return this.publishedPosts().filter(p =>
      p.title.toLowerCase().includes(q) ||
      (p.description ?? '').toLowerCase().includes(q) ||
      p.categories?.some(c => c.toLowerCase().includes(q)) ||
      p.tags?.some(t => t.toLowerCase().includes(q)) ||
      this.getAuthorName(p).toLowerCase().includes(q)
    );
  });
  headerSearchResults = computed<Post[]>(() => this.headerSearchMatches().slice(0, 5));
  headerSearchTotal   = computed<number>(() => this.headerSearchMatches().length);

  getAuthorName(post: Post): string { return (post.user as any)?.name ?? 'Anonymous'; }

  readingTime(post: Post): number {
    return post.readingTimeMinutes ?? Math.max(1, Math.ceil(
      (post.content ?? '').replace(/<[^>]*>/g, '').trim().split(/\s+/).length / 200
    ));
  }

  closeSearch(): void { this.showHeaderSearch.set(false); }

  // Hover-to-open on desktop (matches how most nav mega-menus behave),
  // with a short close delay so moving the mouse from the trigger down into
  // the panel itself doesn't clip it shut. Click still works underneath, for
  // touch and keyboard use.
  private categoryCloseTimer: ReturnType<typeof setTimeout> | null = null;
  openCategories(): void {
    if (this.categoryCloseTimer) { clearTimeout(this.categoryCloseTimer); this.categoryCloseTimer = null; }
    this.showMoreCategories.set(true);
  }
  scheduleCloseCategories(): void {
    if (this.categoryCloseTimer) clearTimeout(this.categoryCloseTimer);
    this.categoryCloseTimer = setTimeout(() => this.showMoreCategories.set(false), 220);
  }

  @HostListener('document:click', ['$event'])
  onDocClick(e: MouseEvent): void {
    const target = e.target as HTMLElement;
    if (!target.closest('.sh-nav-search-wrap')) this.showHeaderSearch.set(false);
    if (!target.closest('.nav-cat-wrap')) this.showMoreCategories.set(false);
    if (!target.closest('.sh-profile-menu-wrap')) this.profileMenuOpen.set(false);
  }

  @HostListener('document:keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Escape') return;
    if (this.menuOpen()) this.menuOpen.set(false);
    if (this.showHeaderSearch()) this.closeSearch();
  }

  ngOnInit(): void {
    this.taxonomyService.load().pipe(takeUntilDestroyed(this.destroyRef)).subscribe();
    this.fetchCurrentUser();

    const cached = this.allPostsCache.get();
    if (cached.length) {
      this.allPosts.set(cached);
      return;
    }
    this.postService.getAllPublished()
      .pipe(catchError(() => of([] as Post[])), takeUntilDestroyed(this.destroyRef))
      .subscribe(posts => {
        this.allPostsCache.set(posts);
        this.allPosts.set(posts);
      });
  }

  ngOnDestroy(): void {}
}
