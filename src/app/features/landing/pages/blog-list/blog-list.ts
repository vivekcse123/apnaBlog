import {
  Component, OnInit, OnDestroy, inject, signal, computed, DestroyRef, PLATFORM_ID,
  ChangeDetectionStrategy, HostListener,
} from '@angular/core';
import { RouterLink, Router, ActivatedRoute } from '@angular/router';
import { CommonModule, isPlatformBrowser, DOCUMENT } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { DomSanitizer, Meta, SafeHtml, Title } from '@angular/platform-browser';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError } from 'rxjs/operators';
import { of } from 'rxjs';
import { environment } from '../../../../../environments/environment';
import { PostService } from '../../../post/services/post-service';
import { AllPostsCache } from '../../../../core/services/all-posts-cache';
import { TaxonomyService } from '../../../../core/services/taxonomy.service';
import { Post } from '../../../../core/models/post.model';
import { MobileBottomNav } from '../../../../shared/mobile-bottom-nav/mobile-bottom-nav';
import { SiteHeader } from '../../../../shared/site-header/site-header';
import { Auth } from '../../../../core/services/auth';
import { BookmarkService } from '../../../../core/services/bookmark.service';
import { ThemeService } from '../../../../core/services/theme-service';
import { ReadingHistory, HistoryEntry } from '../../../../core/services/reading-history';
import { categoryColorFor as sharedCategoryColorFor } from '../../../../shared/utils/category-color';

const FALLBACK_CATEGORIES: string[] = [
  'Update', 'News', 'Sports', 'Entertainment', 'Health', 'Technology', 'Business',
  'Lifestyle', 'Education', 'Exercise', 'Social', 'Village',
  'Career', 'AI', 'Finance', 'Productivity',
];

type SortKey = 'latest' | 'trending' | 'liked' | 'viewed';
type ReadingBucket = '0-5' | '5-15' | '15-30' | '30+';

interface CategoryRow {
  name: string;
  slug: string;
  count: number;
}

@Component({
  selector: 'app-blog-list',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, CommonModule, FormsModule, MobileBottomNav, SiteHeader],
  templateUrl: './blog-list.html',
  styleUrl: './blog-list.css',
})
export class BlogListPage implements OnInit, OnDestroy {
  private router           = inject(Router);
  private route             = inject(ActivatedRoute);
  private postService      = inject(PostService);
  private allPostsCache    = inject(AllPostsCache);
  private taxonomyService  = inject(TaxonomyService);
  private destroyRef       = inject(DestroyRef);
  private sanitizer        = inject(DomSanitizer);
  private platformId       = inject(PLATFORM_ID);
  private meta             = inject(Meta);
  private titleSvc         = inject(Title);
  private document         = inject(DOCUMENT);
  private auth             = inject(Auth);
  private http              = inject(HttpClient);
  private readingHistory   = inject(ReadingHistory);
  bookmarkService           = inject(BookmarkService);
  themeService              = inject(ThemeService);

  // ── Auth-derived routes (same pattern as category-page / home) ──────────
  get isLoggedIn(): boolean { return this.auth.isAuthorized(); }
  get loggedInFirstName(): string { return (this.auth.userName() ?? '').split(' ')[0] || 'You'; }

  get dashboardRoute(): string {
    const id   = this.auth.userId();
    const role = this.auth.userRole();
    if (!id) return '/auth/login';
    if (role === 'admin')       return `/admin/${id}`;
    if (role === 'super_admin') return `/super-admin/${id}`;
    if (role === 'sponsor')     return `/sponsor/${id}`;
    return `/user/${id}`;
  }
  get writeRoute(): string { return this.isLoggedIn ? this.dashboardRoute : '/auth/login'; }

  // ── Category icon set (identical to category-page, kept in
  // sync so the same category renders with the same glyph site-wide) ──────
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

  // ── State ─────────────────────────────────────────────────────────────
  allPosts    = signal<Post[]>([]);
  isLoading   = signal(true);
  currentYear = new Date().getFullYear();

  selectedCategory = signal<string>('All');
  searchQuery       = signal('');
  sortBy            = signal<SortKey>('latest');
  readingBuckets    = signal<Set<ReadingBucket>>(new Set());
  currentPage       = signal(1);
  showFilterPanel   = signal(false);
  showSortDropdown  = signal(false);
  showSortMenu      = signal(false);
  showMobileSearch  = signal(false);

  readonly PAGE_SIZE = 12;

  ALL_CATEGORIES = computed<string[]>(() => {
    const names = this.taxonomyService.categoryNames();
    return names.length ? names : FALLBACK_CATEGORIES;
  });

  private publishedPosts = computed<Post[]>(() =>
    this.allPosts().filter(p => p.status === 'published' && !p.isSponsored)
  );

  categoryRows = computed<CategoryRow[]>(() => {
    const posts = this.publishedPosts();
    const rows = this.ALL_CATEGORIES().map(name => ({
      name,
      slug: name.toLowerCase(),
      count: posts.filter(p => p.categories?.some(c => c.toLowerCase() === name.toLowerCase())).length,
    }));
    return rows.sort((a, b) => b.count - a.count);
  });

  totalPublishedCount = computed(() => this.publishedPosts().length);

  popularTags = computed<{ name: string; count: number }[]>(() => {
    const freq = new Map<string, number>();
    for (const p of this.publishedPosts()) {
      for (const t of p.tags ?? []) {
        freq.set(t, (freq.get(t) ?? 0) + 1);
      }
    }
    return [...freq.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, count]) => ({ name, count }));
  });

  // ── Right sidebar: Trending Now (ranked the same way as the "Trending"
  // sort option, independent of the active category/reading-time filters) ──
  trendingSidebarPosts = computed<Post[]>(() =>
    [...this.publishedPosts()]
      .sort((a, b) => (b.hotScore ?? b.views) - (a.hotScore ?? a.views))
      .slice(0, 5)
  );

  // ── Right sidebar: Top Authors, derived from the authors of the posts
  // already loaded on this page (post count + total views), most-viewed first.
  topAuthors = computed<{ id: string; name: string; avatar?: string; postCount: number; totalViews: number }[]>(() => {
    const map = new Map<string, { id: string; name: string; avatar?: string; postCount: number; totalViews: number }>();
    for (const p of this.publishedPosts()) {
      const user = p.user as any;
      const id = user?._id;
      if (!id) continue;
      const entry = map.get(id) ?? { id, name: user.name ?? 'Anonymous', avatar: user.avatar, postCount: 0, totalViews: 0 };
      entry.postCount++;
      entry.totalViews += p.views ?? 0;
      map.set(id, entry);
    }
    return [...map.values()].sort((a, b) => b.totalViews - a.totalViews).slice(0, 5);
  });

  // ── Right sidebar: Recently Viewed + Reading Streak, sourced from the
  // browser-local reading history (same service the user dashboard uses) ──
  recentlyViewed = signal<HistoryEntry[]>([]);
  readingStreak  = signal(0);

  private computeReadingStreak(): number {
    const allDayTs = this.readingHistory.getEntries()
      .map(e => { const d = new Date(e.readAt); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); })
      .filter((v, i, a) => a.indexOf(v) === i)
      .sort((a, b) => b - a);

    let streak = 0;
    const todayMidnight = new Date(); todayMidnight.setHours(0, 0, 0, 0);
    let checkDay = todayMidnight.getTime();
    const oneDay = 86_400_000;
    for (const dayTs of allDayTs) {
      if (dayTs === checkDay || dayTs === checkDay - oneDay) {
        streak++;
        checkDay = dayTs - oneDay;
      } else { break; }
    }
    return streak;
  }

  // ── Right sidebar: "The ApnaInsights Digest" weekly newsletter signup
  // (same /subscribers/subscribe endpoint the homepage newsletter uses) ──
  digestEmail        = '';
  digestSubscribing  = signal(false);
  digestSuccess      = signal(false);
  digestMessage      = signal('');
  digestError        = signal('');
  digestEmailError   = signal('');

  private static readonly EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  onDigestEmailInput(value: string): void {
    this.digestEmail = value;
    if (!value.trim()) { this.digestEmailError.set(''); return; }
    this.digestEmailError.set(
      BlogListPage.EMAIL_RE.test(value.trim()) ? '' : 'Please enter a valid email address'
    );
  }

  onDigestSubscribe(): void {
    const email = this.digestEmail.trim();
    if (!email || this.digestSubscribing()) return;
    this.digestSubscribing.set(true);
    this.digestError.set('');
    this.http.post<{ status: number; message: string }>(
      `${environment.apiUrl}/subscribers/subscribe`, { email }
    ).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: res => {
        this.digestSubscribing.set(false);
        this.digestSuccess.set(true);
        this.digestMessage.set(res.message ?? 'Subscribed - see you Sunday!');
        this.digestEmail = '';
      },
      error: err => {
        this.digestSubscribing.set(false);
        this.digestError.set(err?.error?.message ?? 'Something went wrong. Please try again.');
      },
    });
  }

  readingTimeCounts = computed<Record<ReadingBucket, number>>(() => {
    const buckets: Record<ReadingBucket, number> = { '0-5': 0, '5-15': 0, '15-30': 0, '30+': 0 };
    for (const p of this.publishedPosts()) {
      buckets[this.bucketFor(this.readingTime(p))]++;
    }
    return buckets;
  });

  private bucketFor(mins: number): ReadingBucket {
    if (mins <= 5)  return '0-5';
    if (mins <= 15) return '5-15';
    if (mins <= 30) return '15-30';
    return '30+';
  }

  toggleReadingBucket(b: ReadingBucket): void {
    const next = new Set(this.readingBuckets());
    next.has(b) ? next.delete(b) : next.add(b);
    this.readingBuckets.set(next);
    this.currentPage.set(1);
  }

  selectCategory(name: string): void {
    this.selectedCategory.set(name);
    this.currentPage.set(1);
  }

  setSort(key: SortKey): void {
    this.sortBy.set(key);
    this.currentPage.set(1);
    this.showSortDropdown.set(false);
    this.showSortMenu.set(false);
  }

  resetFilters(): void {
    this.selectedCategory.set('All');
    this.searchQuery.set('');
    this.sortBy.set('latest');
    this.readingBuckets.set(new Set());
    this.currentPage.set(1);
  }

  hasActiveFilters = computed(() =>
    this.selectedCategory() !== 'All' || !!this.searchQuery() || this.readingBuckets().size > 0
  );

  filteredPosts = computed<Post[]>(() => {
    const cat     = this.selectedCategory();
    const q       = this.searchQuery().trim().toLowerCase();
    const buckets = this.readingBuckets();

    return this.publishedPosts().filter(p => {
      if (cat !== 'All' && !p.categories?.some(c => c.toLowerCase() === cat.toLowerCase())) return false;
      if (q &&
          !p.title.toLowerCase().includes(q) &&
          !(p.description ?? '').toLowerCase().includes(q) &&
          !((p.user as any)?.name ?? '').toLowerCase().includes(q)
      ) return false;
      if (buckets.size > 0 && !buckets.has(this.bucketFor(this.readingTime(p)))) return false;
      return true;
    });
  });

  sortedPosts = computed<Post[]>(() => {
    const posts = [...this.filteredPosts()];
    switch (this.sortBy()) {
      case 'trending': return posts.sort((a, b) => (b.hotScore ?? b.views) - (a.hotScore ?? a.views));
      case 'liked':    return posts.sort((a, b) => b.likesCount - a.likesCount);
      case 'viewed':   return posts.sort((a, b) => b.views - a.views);
      default:         return posts.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }
  });

  totalPages   = computed(() => Math.max(1, Math.ceil(this.sortedPosts().length / this.PAGE_SIZE)));
  pagedPosts   = computed(() => {
    const start = (this.currentPage() - 1) * this.PAGE_SIZE;
    return this.sortedPosts().slice(start, start + this.PAGE_SIZE);
  });

  pageNumbers = computed<(number | '…')[]>(() => {
    const total = this.totalPages();
    const cur   = this.currentPage();
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
    const pages = new Set<number>([1, 2, total - 1, total, cur - 1, cur, cur + 1]);
    const sorted = [...pages].filter(n => n >= 1 && n <= total).sort((a, b) => a - b);
    const out: (number | '…')[] = [];
    let prev = 0;
    for (const n of sorted) {
      if (prev && n - prev > 1) out.push('…');
      out.push(n);
      prev = n;
    }
    return out;
  });

  goToPage(n: number): void {
    if (n < 1 || n > this.totalPages()) return;
    this.currentPage.set(n);
    if (isPlatformBrowser(this.platformId)) {
      this.document.getElementById('blog-grid-top')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  // ── Lifecycle ────────────────────────────────────────────────────────
  ngOnInit(): void {
    this.taxonomyService.load().pipe(takeUntilDestroyed(this.destroyRef)).subscribe();
    this.applyQueryParams();
    this.setMeta();
    this.loadPosts();

    if (isPlatformBrowser(this.platformId)) {
      setTimeout(() => this.pushAds(), 300);
      this.recentlyViewed.set(this.readingHistory.getEntries().slice(0, 4));
      this.readingStreak.set(this.computeReadingStreak());
    }
  }

  // Honors the old /search page's ?q= and ?sort= deep links (now redirected
  // here) so bookmarks, the homepage's SearchAction schema, and any other
  // link built against the old page still land on the right filtered view.
  private applyQueryParams(): void {
    const params = this.route.snapshot.queryParamMap;
    const q = params.get('q');
    if (q) this.searchQuery.set(q);

    const sort = params.get('sort');
    const validSorts: SortKey[] = ['latest', 'trending', 'liked', 'viewed'];
    if (sort && (validSorts as string[]).includes(sort)) this.sortBy.set(sort as SortKey);
  }

  ngOnDestroy(): void {
    this.document.getElementById('blog-list-schema')?.remove();
    this.document.getElementById('blog-list-itemlist')?.remove();
  }

  @HostListener('document:click', ['$event'])
  onDocClick(e: MouseEvent): void {
    const target = e.target as HTMLElement;
    if (!target.closest('.bl-sort-wrap')) this.showSortDropdown.set(false);
    if (!target.closest('.bl-sort-menu-wrap')) this.showSortMenu.set(false);
    if (!target.closest('.bl-filter-wrap')) this.showFilterPanel.set(false);
  }

  @HostListener('document:keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && this.showMobileSearch()) this.showMobileSearch.set(false);
  }

  private loadPosts(): void {
    const cached = this.allPostsCache.get();
    if (cached.length) {
      this.allPosts.set(cached);
      this.isLoading.set(false);
      this.injectItemList();
      return;
    }
    this.isLoading.set(true);
    this.postService.getAllPublished()
      .pipe(catchError(() => of([] as Post[])), takeUntilDestroyed(this.destroyRef))
      .subscribe(posts => {
        this.allPostsCache.set(posts);
        this.allPosts.set(posts);
        this.isLoading.set(false);
        this.injectItemList();
      });
  }

  private pushedAds = new WeakSet<Element>();
  private pushAds(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    try {
      const ads: any[] = (window as any).adsbygoogle ?? [];
      (window as any).adsbygoogle = ads;
      this.document.querySelectorAll('.page-ad-wrap ins.adsbygoogle').forEach(el => {
        if (this.pushedAds.has(el)) return;
        this.pushedAds.add(el);
        ads.push({});
      });
    } catch (_) {}
  }

  private setMeta(): void {
    const url  = `${environment.siteUrl}/blog`;
    const desc = 'Browse every published story on ApnaInsights - Technology, AI, Career, Business, Health, Lifestyle, Education, Finance, Sports and News, filterable by category, tag and reading time.';

    this.titleSvc.setTitle('All Blogs | ApnaInsights');
    this.meta.updateTag({ name: 'description',        content: desc });
    this.meta.updateTag({ name: 'robots',             content: 'index, follow' });
    this.meta.updateTag({ property: 'og:title',       content: 'All Blogs | ApnaInsights' });
    this.meta.updateTag({ property: 'og:description', content: desc });
    this.meta.updateTag({ property: 'og:url',         content: url });
    this.meta.updateTag({ property: 'og:type',        content: 'website' });

    let canonical = this.document.querySelector('link[rel="canonical"]') as HTMLLinkElement;
    if (!canonical) {
      canonical = this.document.createElement('link');
      canonical.setAttribute('rel', 'canonical');
      this.document.head.appendChild(canonical);
    }
    canonical.setAttribute('href', url);

    const graph = {
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'CollectionPage',
          '@id':   `${url}#webpage`,
          url,
          name: 'All Blogs',
          description: desc,
          inLanguage: 'en-IN',
          isPartOf: { '@id': `${environment.siteUrl}/#website` },
          publisher: { '@id': `${environment.siteUrl}/#organization` },
        },
        {
          '@type':         'BreadcrumbList',
          '@id':           `${url}#breadcrumb`,
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Home', item: environment.siteUrl },
            { '@type': 'ListItem', position: 2, name: 'Blog', item: url },
          ],
        },
      ],
    };
    let el = this.document.getElementById('blog-list-schema');
    if (!el) {
      el = this.document.createElement('script');
      el.id = 'blog-list-schema';
      (el as HTMLScriptElement).type = 'application/ld+json';
      this.document.head.appendChild(el);
    }
    el.textContent = JSON.stringify(graph);
  }

  private injectItemList(): void {
    const posts = this.sortedPosts().slice(0, 20);
    if (!posts.length) return;
    const url  = `${environment.siteUrl}/blog`;
    const site = environment.siteUrl;
    const itemList = {
      '@context': 'https://schema.org',
      '@type':    'ItemList',
      '@id':      `${url}#itemlist`,
      name:       'Latest Stories on ApnaInsights',
      url,
      numberOfItems: posts.length,
      itemListElement: posts.map((p, i) => ({
        '@type':  'ListItem',
        position: i + 1,
        url:      `${site}/blog/${p.slug || p._id}`,
        name:     p.title,
      })),
    };
    let el = this.document.getElementById('blog-list-itemlist');
    if (!el) {
      el = this.document.createElement('script');
      el.id = 'blog-list-itemlist';
      (el as HTMLScriptElement).type = 'application/ld+json';
      this.document.head.appendChild(el);
    }
    el.textContent = JSON.stringify(itemList);
  }

  // ── Template helpers ─────────────────────────────────────────────────
  navigateToBlog(post: Post): void {
    this.router.navigate(['/blog', post.slug || post._id]);
    if (isPlatformBrowser(this.platformId)) window.scrollTo({ top: 0, behavior: 'instant' });
  }

  getAuthorName(post: Post): string { return (post.user as any)?.name ?? 'Anonymous'; }
  getAuthorId(post: Post): string | null { return (post.user as any)?._id ?? null; }
  getAuthorInitial(post: Post): string { return this.getAuthorName(post).charAt(0).toUpperCase(); }

  isBookmarked(postId: string): boolean { return this.bookmarkService.isBookmarked(postId); }
  toggleBookmark(postId: string, event: Event): void {
    event.stopPropagation();
    event.preventDefault();
    this.bookmarkService.toggle(postId);
  }

  fmtCount(n: number): string {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
    if (n >= 1_000)     return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
    return String(n ?? 0);
  }

  private rtCache = new Map<string, number>();
  readingTime(post: Post): number {
    const id = post._id;
    if (this.rtCache.has(id)) return this.rtCache.get(id)!;
    const mins = post.readingTimeMinutes ?? Math.max(1, Math.ceil(
      (post.content ?? '').replace(/<[^>]*>/g, '').trim().split(/\s+/).length / 200
    ));
    this.rtCache.set(id, mins);
    return mins;
  }
}
