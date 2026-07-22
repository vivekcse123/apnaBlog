import {
  Component, OnInit, OnDestroy, inject, signal, computed, DestroyRef, PLATFORM_ID, HostListener,
  ChangeDetectionStrategy
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { environment } from '../../../../../environments/environment';
import { CommonModule, DatePipe, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, Meta, SafeHtml, Title } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError } from 'rxjs/operators';
import { of } from 'rxjs';
import { PostService }    from '../../../post/services/post-service';
import { AllPostsCache }  from '../../../../core/services/all-posts-cache';
import { TaxonomyService } from '../../../../core/services/taxonomy.service';
import { Post }           from '../../../../core/models/post.model';
import { TimeAgoPipe }    from '../../../../shared/pipes/time-ago-pipe';
import { MobileBottomNav } from '../../../../shared/mobile-bottom-nav/mobile-bottom-nav';
import { SiteHeader } from '../../../../shared/site-header/site-header';
import { LiveNewsSection } from '../../../../shared/live-news-section/live-news-section';
import { Auth }           from '../../../../core/services/auth';
import { BookmarkService } from '../../../../core/services/bookmark.service';

const FALLBACK_CATEGORIES: string[] = [
  'Update', 'News', 'Sports', 'Entertainment', 'Health', 'Technology', 'Business',
  'Lifestyle', 'Education', 'Exercise', 'Social', 'Village',
  'Career', 'AI', 'Finance', 'Productivity',
];

const CATEGORY_DESCRIPTIONS: Record<string, { description: string; intro: string }> = {
  'News':          {
    description: 'Stay updated with the latest news, current events, and breaking stories from across India and the world, written by real community journalists on ApnaInsights.',
    intro:       'Real news and current events written by community voices - from local happenings to national headlines, unfiltered and authentic.'
  },
  'Update':        {
    description: 'Platform announcements, new features, and community news from the ApnaInsights team. Stay informed about what\'s new on the platform.',
    intro:       'The latest announcements, feature updates, and community highlights straight from the ApnaInsights team.'
  },
  'Technology':    {
    description: 'Explore technology trends, AI insights, and coding tutorials written by Indian developers on ApnaInsights.',
    intro:       'From AI breakthroughs to coding tutorials and gadget reviews - technology stories written by developers and enthusiasts who live and breathe tech.'
  },
  'Health':        {
    description: 'Discover health tips, wellness advice, fitness guides, mental health stories, and medical insights from real people sharing their health journeys on ApnaInsights.',
    intro:       'Real health journeys, expert wellness tips, mental health stories, and everyday health advice written by people who\'ve been there.'
  },
  'Sports':        {
    description: 'Read cricket, football, kabaddi, and all sports stories, match analyses, player profiles, and sports news from passionate fans on ApnaInsights.',
    intro:       'Cricket, football, kabaddi and beyond - match analyses, player profiles, and sports opinions from fans who live for the game.'
  },
  'Village':       {
    description: 'Real stories from rural India - village life, farming wisdom, local culture, traditions, and authentic voices from the heartland of India on ApnaInsights.',
    intro:       'Authentic stories from rural India - farming wisdom, village traditions, local culture, and the heartbeat of communities you rarely hear about.'
  },
  'Business':      {
    description: 'Entrepreneurship, startup stories, career advice, investment tips, and business insights from Indian professionals, founders and working professionals on ApnaInsights.',
    intro:       'Startup journeys, entrepreneurship lessons, career advice, and real business stories from founders and professionals building India\'s future.'
  },
  'Entertainment': {
    description: 'Bollywood reviews, movie recommendations, web series opinions, celebrity stories, and Indian entertainment news written by passionate fans on ApnaInsights.',
    intro:       'Bollywood, OTT reviews, celebrity stories, and entertainment opinions written by fans who take their pop culture seriously.'
  },
  'Education':     {
    description: 'Study tips, career guidance, exam preparation strategies, and school and college experiences written by students, teachers, and learners on ApnaInsights.',
    intro:       'Study strategies, exam tips, college life, career guidance and real experiences from students and educators navigating India\'s education system.'
  },
  'Lifestyle':     {
    description: 'Personal growth, travel diaries, fashion, home décor, relationships, and everyday lifestyle stories from people living their best lives across India on ApnaInsights.',
    intro:       'Travel diaries, personal growth journeys, home décor ideas, relationship advice, and the real story of everyday life across India.'
  },
  'Exercise':      {
    description: 'Workout routines, gym tips, yoga guides, running stories, and personal fitness journeys from health-conscious writers sharing their experiences on ApnaInsights.',
    intro:       'Gym routines, yoga guides, running diaries, and personal fitness transformations from people who chose to make health a priority.'
  },
  'Social':        {
    description: 'Social issues, cultural observations, human interest pieces, and important conversations about modern Indian society on ApnaInsights.',
    intro:       'Social issues, community voices, cultural observations, and human interest insights that spark the conversations modern India needs to have.'
  },
  'Career':        {
    description: 'Job interviews, salary negotiations, resume tips, career switches, and real workplace stories from Indian professionals sharing what actually works in India\'s job market.',
    intro:       'Real career advice for the Indian job market - from cracking TCS to negotiating your hike at an MNC, written by people who have been there.'
  },
  'AI':            {
    description: 'Practical guides on using AI tools like ChatGPT, Gemini, and Copilot in your work, plus honest takes on how artificial intelligence is changing jobs in India.',
    intro:       'How to actually use AI in your daily work - practical guides on the tools, prompts, and workflows that Indian professionals are using right now.'
  },
  'Finance':       {
    description: 'Personal finance tips, tax-saving strategies, investment guides, and money management advice written by Indian professionals for the Indian financial context.',
    intro:       'Your salary, your taxes, your investments - practical personal finance advice grounded in Indian reality, not Western assumptions.'
  },
  'Productivity':  {
    description: 'Time management, work-from-home tips, focus techniques, tools, and real productivity systems that working professionals in India actually use and recommend.',
    intro:       'Not generic hustle advice - real systems, tools, and habits that working professionals in India use to get more done without burning out.'
  },
};

@Component({
  selector: 'app-category-page',
  standalone: true,
  imports: [RouterLink, CommonModule, FormsModule, DatePipe, TimeAgoPipe, MobileBottomNav, SiteHeader, LiveNewsSection],
  templateUrl: './category-page.html',
  styleUrl: './category-page.css',
})
export class CategoryPage implements OnInit, OnDestroy {
  private route           = inject(ActivatedRoute);
  private router          = inject(Router);
  private postService     = inject(PostService);
  private allPostsCache   = inject(AllPostsCache);
  private taxonomyService = inject(TaxonomyService);
  private destroyRef      = inject(DestroyRef);
  private sanitizer   = inject(DomSanitizer);
  private platformId  = inject(PLATFORM_ID);
  private meta        = inject(Meta);
  private titleSvc    = inject(Title);
  private document    = inject(DOCUMENT);
  private auth        = inject(Auth);
  bookmarkService     = inject(BookmarkService);

  // Category pages are the site's top SEO landing pages - they need a way to
  // search or start writing without first clicking "Back to Home". Uses the
  // same synchronous auth-signal pattern as Home's writeRoute (no profile
  // fetch needed just to route correctly).
  get isLoggedIn(): boolean { return this.auth.isAuthorized(); }
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

  private readonly ICONS: Record<string, string> = {
    Technology:    `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>`,
    Health:        `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`,
    Sports:        `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="6"/><path d="M15.477 12.89L17 22l-5-3-5 3 1.523-9.11"/></svg>`,
    Business:      `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/></svg>`,
    Lifestyle:     `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`,
    Education:     `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>`,
    Entertainment: `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="2.18"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="2" y1="7" x2="7" y2="7"/><line x1="2" y1="17" x2="7" y2="17"/><line x1="17" y1="17" x2="22" y2="17"/><line x1="17" y1="7" x2="22" y2="7"/></svg>`,
    Village:       `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`,
    Social:        `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
    Exercise:      `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>`,
    News:          `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>`,
    Update:        `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>`,
    Career:        `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>`,
    AI:            `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/><line x1="9" y1="20" x2="9" y2="23"/><line x1="15" y1="20" x2="15" y2="23"/><line x1="20" y1="9" x2="23" y2="9"/><line x1="20" y1="14" x2="23" y2="14"/><line x1="1" y1="9" x2="4" y2="9"/><line x1="1" y1="14" x2="4" y2="14"/></svg>`,
    Finance:       `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>`,
    Productivity:  `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>`,
  };

  getCategoryIcon(): SafeHtml {
    const svg = this.ICONS[this.categoryName()]
      ?? `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/></svg>`;
    return this.sanitizer.bypassSecurityTrustHtml(svg);
  }

  categorySlug    = signal('');
  categoryName    = signal('');
  categoryIntro   = signal('');
  allPosts        = signal<Post[]>([]);
  isLoading       = signal(true);
  showCatDropdown = signal(false);
  searchQuery     = signal('');

  // News category only: lets the reader swap which of the two sections
  // (Live News feed vs the regular published-stories grid) renders first.
  // Persisted so the choice survives revisits.
  private readonly SECTION_ORDER_KEY = 'apnainsights:news-section-order';
  sectionOrder = signal<'live-first' | 'posts-first'>('live-first');

  toggleSectionOrder(): void {
    const next = this.sectionOrder() === 'live-first' ? 'posts-first' : 'live-first';
    this.sectionOrder.set(next);
    if (isPlatformBrowser(this.platformId)) {
      try { localStorage.setItem(this.SECTION_ORDER_KEY, next); } catch { /* storage unavailable */ }
    }
  }

  ALL_CATEGORIES = computed<string[]>(() => {
    const names = this.taxonomyService.categoryNames();
    return names.length ? names : FALLBACK_CATEGORIES;
  });

  categoryEmoji = computed<string>(() => {
    const map = this.taxonomyService.categoryEmojiMap();
    return map[this.categoryName()] ?? '';
  });

  @HostListener('document:click', ['$event'])
  onDocClick(e: MouseEvent): void {
    const target = e.target as HTMLElement;
    if (!target.closest('.cat-switch-wrap')) {
      this.showCatDropdown.set(false);
    }
  }

  toggleCatDropdown(): void { this.showCatDropdown.set(!this.showCatDropdown()); }

  switchCategory(cat: string): void {
    this.showCatDropdown.set(false);
    this.router.navigate(['/category', cat.toLowerCase()]);
    if (isPlatformBrowser(this.platformId)) window.scrollTo({ top: 0, behavior: 'instant' });
  }

  posts = computed(() => {
    const name = this.categoryName().toLowerCase();
    return this.allPosts()
      .filter(p =>
        (p.status === 'published') &&
        !p.isSponsored &&
        p.categories?.some(c => c.toLowerCase() === name) &&
        this._hasQualityDescription(p.description)
      )
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  });

  private _hasQualityDescription(desc: string | null | undefined): boolean {
    if (!desc) return false;
    const words = desc.trim().split(/\s+/).filter(Boolean);
    return words.length >= 12;
  }

  // Same threshold as applyRobotsForCount() - don't show an ad on a page
  // that's mostly empty (AdSense low-value-content / ad-density risk).
  isThinPage = computed(() => !this.isLoading() && this.posts().length < 5);

  // Renders posts in batches instead of the full (sometimes 100s-long) list -
  // large categories were producing multi-MB prerendered HTML. All posts are
  // already in memory (allPostsCache), so "Load more" is instant, no refetch.
  showSearch = computed(() => this.posts().length > 10);

  filteredPosts = computed(() => {
    const q = this.searchQuery().trim().toLowerCase();
    if (!q) return this.posts();
    return this.posts().filter(p =>
      p.title.toLowerCase().includes(q) ||
      (p.description ?? '').toLowerCase().includes(q) ||
      ((p.user as any)?.name ?? '').toLowerCase().includes(q)
    );
  });

  readonly PAGE_SIZE = 24;
  displayCount = signal(this.PAGE_SIZE);
  visiblePosts = computed(() => this.filteredPosts().slice(0, this.displayCount()));
  hasMorePosts = computed(() => this.filteredPosts().length > this.displayCount());

  loadMore(): void {
    this.displayCount.update(n => n + this.PAGE_SIZE);
  }

  currentYear = new Date().getFullYear();

  // Tracks which .adsbygoogle <ins> elements have already been pushed -
  // category route params can re-fire (e.g. switching categories), and
  // re-pushing an already-initialised <ins> throws "already have ads in them".
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

  ngOnInit(): void {
    // Load taxonomy so ALL_CATEGORIES() is populated from API
    this.taxonomyService.load().pipe(takeUntilDestroyed(this.destroyRef)).subscribe();

    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(params => {
      const slug = params.get('category') ?? '';
      // Resolve slug to canonical category name (case-insensitive match)
      const matched = this.ALL_CATEGORIES().find(c => c.toLowerCase() === slug.toLowerCase())
        ?? FALLBACK_CATEGORIES.find(c => c.toLowerCase() === slug.toLowerCase());
      if (!matched) { this.router.navigate(['/']); return; }

      this.categorySlug.set(slug.toLowerCase());
      this.categoryName.set(matched);
      this.searchQuery.set('');
      this.displayCount.set(this.PAGE_SIZE);
      if (matched === 'News' && isPlatformBrowser(this.platformId)) {
        try {
          const saved = localStorage.getItem(this.SECTION_ORDER_KEY);
          if (saved === 'live-first' || saved === 'posts-first') this.sectionOrder.set(saved);
        } catch { /* storage unavailable */ }
      }
      this.setMeta(matched);
      this.loadPosts();
      setTimeout(() => this.pushAds(), 300);
    });
  }

  ngOnDestroy(): void {
    this.document.getElementById('category-schema')?.remove();
    this.document.getElementById('category-itemlist')?.remove();
  }

  private loadPosts(): void {
    // Instant render from shared cache (populated by home page fetchAccurateStats)
    const cached = this.allPostsCache.get();
    if (cached.length) {
      this.allPosts.set(cached);
      this.isLoading.set(false);
      this.applyRobotsForCount();
      this.setOgImage();
      this.injectItemList(this.posts());
      return;
    }

    // Direct navigation / hard refresh - fetch all pages ourselves
    this.isLoading.set(true);
    this.postService.getAllPublished()
      .pipe(
        catchError(() => of([] as Post[])),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(posts => {
        this.allPostsCache.set(posts);
        this.allPosts.set(posts);
        this.isLoading.set(false);
        this.applyRobotsForCount();
        this.setOgImage();
        this.injectItemList(this.posts());
      });
  }

  // Once the category's real posts are in, swap the generic sitewide og:image
  // for the most recent post's own featured image - actually relevant to what
  // this category link is sharing, same fallback as blog-detail.ts.
  private setOgImage(): void {
    const image = this.posts()[0]?.featuredImage || environment.ogImage;
    this.meta.updateTag({ property: 'og:image', content: image });
    this.meta.updateTag({ name: 'twitter:image', content: image });
  }

  // Mark thin category pages noindex so they don't hurt AdSense review.
  // Categories with fewer than 5 published posts don't have enough content
  // to provide value to a visitor - indexing them works against us.
  private applyRobotsForCount(): void {
    const count = this.posts().length;
    // Quotes pages are thin by nature (quote compilations add little unique value).
    // Always keep noindex regardless of post count - Quotes was dropped from the
    // site's own category list, but legacy posts may still carry the tag.
    const isLowValue = this.categoryName() === 'Quotes';
    const robots = (!isLowValue && count >= 5) ? 'index, follow' : 'noindex, follow';
    this.meta.updateTag({ name: 'robots', content: robots });
  }

  private setMeta(name: string): void {
    const url   = `${environment.siteUrl}/category/${name.toLowerCase()}`;
    const info  = CATEGORY_DESCRIPTIONS[name];
    const desc  = info?.description ?? `Read the latest ${name} guides and insights from verified contributors on ApnaInsights. Practical knowledge on ${name}.`;
    const intro = info?.intro ?? '';

    this.categoryIntro.set(intro);
    this.titleSvc.setTitle(`${name} Guides & Insights | ApnaInsights`);
    this.meta.updateTag({ name: 'description',        content: desc });
    // Fail safe to noindex until applyRobotsForCount() confirms the category
    // has enough posts - avoids a crawler ever seeing `index` on an
    // empty/thin category page (soft-404 risk).
    this.meta.updateTag({ name: 'robots',             content: 'noindex, follow' });
    this.meta.updateTag({ property: 'og:title',       content: `${name} Guides & Insights | ApnaInsights` });
    this.meta.updateTag({ property: 'og:description', content: desc });
    this.meta.updateTag({ property: 'og:url',         content: url });
    this.meta.updateTag({ property: 'og:type',        content: 'website' });
    this.meta.updateTag({ property: 'og:image',        content: environment.ogImage });
    this.meta.updateTag({ property: 'og:image:width',  content: '1200' });
    this.meta.updateTag({ property: 'og:image:height', content: '630' });
    this.meta.updateTag({ property: 'og:image:alt',    content: `${name} Guides & Insights | ApnaInsights` });
    this.meta.updateTag({ name: 'twitter:card',        content: 'summary_large_image' });
    this.meta.updateTag({ name: 'twitter:title',       content: `${name} Guides & Insights | ApnaInsights` });
    this.meta.updateTag({ name: 'twitter:description', content: desc });
    this.meta.updateTag({ name: 'twitter:image',       content: environment.ogImage });

    let canonical = this.document.querySelector('link[rel="canonical"]') as HTMLLinkElement;
    if (!canonical) {
      canonical = this.document.createElement('link');
      canonical.setAttribute('rel', 'canonical');
      this.document.head.appendChild(canonical);
    }
    canonical.setAttribute('href', url);

    // Structured data - @graph format (valid for multiple types in one tag)
    const graph = {
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type':       'CollectionPage',
          '@id':         `${url}#webpage`,
          url,
          name:          `${name} Guides & Insights`,
          description:   desc,
          inLanguage:    'en-IN',
          isPartOf:      { '@id': `${environment.siteUrl}/#website` },
          about:         { '@type': 'Thing', name },
          publisher:     { '@id': `${environment.siteUrl}/#organization` },
        },
        {
          '@type':         'BreadcrumbList',
          '@id':           `${url}#breadcrumb`,
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Home', item: environment.siteUrl },
            { '@type': 'ListItem', position: 2, name,          item: url },
          ],
        },
      ],
    };
    let el = this.document.getElementById('category-schema');
    if (!el) {
      el    = this.document.createElement('script');
      el.id = 'category-schema';
      (el as HTMLScriptElement).type = 'application/ld+json';
      this.document.head.appendChild(el);
    }
    el.textContent = JSON.stringify(graph);
  }

  // Called after posts load - injects ItemList for the visible posts
  private injectItemList(posts: Post[]): void {
    if (!posts.length) return;
    const url     = `${environment.siteUrl}/category/${this.categorySlug()}`;
    const site    = environment.siteUrl;
    const itemList = {
      '@context': 'https://schema.org',
      '@type':    'ItemList',
      '@id':      `${url}#itemlist`,
      name:       `${this.categoryName()} Stories on ApnaInsights`,
      url,
      numberOfItems: posts.length,
      itemListElement: posts.slice(0, 20).map((p, i) => ({
        '@type':    'ListItem',
        position:   i + 1,
        url:        `${site}/blog/${(p as any).slug || p._id}`,
        name:       p.title,
      })),
    };
    let el = this.document.getElementById('category-itemlist');
    if (!el) {
      el    = this.document.createElement('script');
      el.id = 'category-itemlist';
      (el as HTMLScriptElement).type = 'application/ld+json';
      this.document.head.appendChild(el);
    }
    el.textContent = JSON.stringify(itemList);
  }

  navigateToBlog(post: Post): void {
    this.router.navigate(['/blog', post.slug || post._id]);
    if (isPlatformBrowser(this.platformId)) window.scrollTo({ top: 0, behavior: 'instant' });
  }

  getAuthorName(post: Post): string {
    return (post.user as any)?.name ?? 'Anonymous';
  }

  getAuthorId(post: Post): string | null {
    return (post.user as any)?._id ?? null;
  }

  getAuthorInitial(post: Post): string {
    return this.getAuthorName(post).charAt(0).toUpperCase();
  }

  isBookmarked(postId: string): boolean { return this.bookmarkService.isBookmarked(postId); }

  toggleBookmark(postId: string, event: Event): void {
    event.stopPropagation();
    event.preventDefault();
    this.bookmarkService.toggle(postId);
  }

  fmtCount(n: number): string {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
    if (n >= 1_000)     return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
    return String(n);
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
