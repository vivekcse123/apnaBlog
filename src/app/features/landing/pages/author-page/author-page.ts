import {
  ChangeDetectionStrategy, Component, DestroyRef, OnInit, OnDestroy, PLATFORM_ID, computed, inject, signal
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { environment } from '../../../../../environments/environment';
import { CommonModule, DatePipe, isPlatformBrowser } from '@angular/common';
import { Meta, Title } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { PostService } from '../../../post/services/post-service';
import { UserService } from '../../../user/services/user-service';
import { ShortsService } from '../../../shorts/services/shorts.service';
import { Auth } from '../../../../core/services/auth';
import { Post } from '../../../../core/models/post.model';
import { User } from '../../../user/models/user.mode';
import { VideoShort } from '../../../shorts/models/video-short.model';
import { TimeAgoPipe } from '../../../../shared/pipes/time-ago-pipe';
import { MobileBottomNav } from '../../../../shared/mobile-bottom-nav/mobile-bottom-nav';
import { SiteHeader } from '../../../../shared/site-header/site-header';
import { BookmarkService } from '../../../../core/services/bookmark.service';
import { MessageComposerModal } from '../message-composer.modal';

// Emoji + accent colour for the expertise chips - derived from each author's
// own post categories (real data) rather than a fabricated skills list.
// Keep in sync with the category set used across the site (home/blog-list).
const CATEGORY_META: Record<string, { emoji: string; color: string }> = {
  Technology:    { emoji: '💻', color: '#2563EB' },
  Health:        { emoji: '❤️', color: '#EF4444' },
  Sports:        { emoji: '🏏', color: '#F59E0B' },
  Business:      { emoji: '💼', color: '#7C3AED' },
  AI:            { emoji: '🤖', color: '#7C3AED' },
  Career:        { emoji: '💼', color: '#0F766E' },
  Finance:       { emoji: '💰', color: '#16A34A' },
  Lifestyle:     { emoji: '🌿', color: '#0D9488' },
  Education:     { emoji: '🎓', color: '#2563EB' },
  Entertainment: { emoji: '🎬', color: '#DB2777' },
  Village:       { emoji: '🏡', color: '#65A30D' },
  Social:        { emoji: '🌐', color: '#0EA5E9' },
  Exercise:      { emoji: '🏋️', color: '#F97316' },
  News:          { emoji: '📰', color: '#475569' },
  Update:        { emoji: '🔔', color: '#475569' },
  Productivity:  { emoji: '⚡', color: '#CA8A04' },
};
const DEFAULT_CATEGORY_META = { emoji: '📝', color: '#64748B' };

@Component({
  selector: 'app-author-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, CommonModule, DatePipe, TimeAgoPipe, MobileBottomNav, SiteHeader, MessageComposerModal],
  templateUrl: './author-page.html',
  styleUrl: './author-page.css',
})
export class AuthorPage implements OnInit, OnDestroy {
  private route         = inject(ActivatedRoute);
  private router        = inject(Router);
  private postService   = inject(PostService);
  private userService   = inject(UserService);
  private shortsService = inject(ShortsService);
  private auth          = inject(Auth);
  bookmarkService        = inject(BookmarkService);
  showMessageModal = signal(false);
  private destroyRef  = inject(DestroyRef);
  private platformId  = inject(PLATFORM_ID);
  private meta        = inject(Meta);
  private titleSvc    = inject(Title);
  private document    = inject(DOCUMENT);
  private http        = inject(HttpClient);

  author          = signal<User | null>(null);
  posts           = signal<Post[]>([]);
  isLoading       = signal(true);
  notFound        = signal(false);
  followersCount  = signal(0);
  followingCount  = signal(0);
  isFollowing     = signal(false);
  followLoading   = signal(false);
  shorts          = signal<VideoShort[]>([]);
  shortsLoading   = signal(false);
  postsLoading    = signal(true);

  bioExpanded      = signal(false);
  visibleArticles  = signal(6);
  shareCopied      = signal(false);

  // Floating newsletter widget (desktop only, see author-page.css) - stays
  // fixed to the viewport instead of a sticky sidebar item, since a sticky
  // item's "stuck" range is bounded by the article grid and releases once
  // scrolled past the footer. Dismissal is per-tab (sessionStorage), same
  // pattern as the homepage welcome modal.
  showFloatingNewsletter = signal(true);
  private static readonly NEWSLETTER_DISMISSED_KEY = 'apna_author_newsletter_dismissed';

  dismissFloatingNewsletter(): void {
    this.showFloatingNewsletter.set(false);
    if (isPlatformBrowser(this.platformId)) {
      sessionStorage.setItem(AuthorPage.NEWSLETTER_DISMISSED_KEY, '1');
    }
  }

  // Accurate stats from backend
  totalViewsFromApi  = signal(0);
  totalLikesFromApi  = signal(0);
  shortsCountFromApi = signal(0);
  totalBlogsFromApi  = signal(0);
  topPosts           = signal<Post[]>([]);

  isLoggedIn   = computed(() => this.auth.isAuthorized());
  currentUid   = computed(() => this.auth.userId());
  isOwnProfile = computed(() => !!this.currentUid() && this.currentUid() === (this.author() as any)?._id);

  totalViews = computed(() => this.totalViewsFromApi() || this.posts().reduce((s, p) => s + (p.views ?? 0), 0));
  totalLikes = computed(() => this.totalLikesFromApi() || this.posts().reduce((s, p) => s + (p.likesCount ?? 0), 0));

  // Comments and reading time have no per-author aggregate from the API -
  // computed client-side from the author's own published posts, same
  // pattern as user-home.ts's totalComments.
  totalComments = computed(() => this.posts().reduce((s, p) => s + (p.commentsCount ?? 0), 0));
  totalReadingMinutes = computed(() =>
    this.posts().reduce((s, p) => s + this.readingTime(p), 0));
  totalReadingHoursLabel = computed(() => {
    const mins = this.totalReadingMinutes();
    if (mins < 60) return `${mins}m`;
    const hrs = mins / 60;
    return `${hrs % 1 === 0 ? hrs : hrs.toFixed(1)}h`;
  });

  // Expertise chips - top categories across this author's own published
  // posts, ranked by frequency. Real data only, no fabricated skills list.
  expertise = computed(() => {
    const counts = new Map<string, number>();
    for (const p of this.posts()) {
      for (const c of p.categories ?? []) {
        counts.set(c, (counts.get(c) ?? 0) + 1);
      }
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([name, count]) => ({ name, count, ...(CATEGORY_META[name] ?? DEFAULT_CATEGORY_META) }));
  });

  // Featured article - the author's single highest-viewed post.
  featuredArticle = computed(() => {
    const top = this.topPosts();
    if (top.length) return top[0];
    return [...this.posts()].sort((a, b) => (b.views ?? 0) - (a.views ?? 0))[0] ?? null;
  });

  // Latest articles grid excludes whatever is already shown as the featured
  // article, then paginates client-side (all posts are already fetched).
  latestArticles = computed(() => {
    const featuredId = this.featuredArticle()?._id;
    return this.posts().filter(p => p._id !== featuredId);
  });
  visibleLatestArticles = computed(() => this.latestArticles().slice(0, this.visibleArticles()));
  hasMoreArticles = computed(() => this.visibleArticles() < this.latestArticles().length);

  bioIsLong = computed(() => this.authorBio.length > 220);
  bioPreview = computed(() => this.bioIsLong() && !this.bioExpanded()
    ? this.authorBio.slice(0, 220).trim() + '…'
    : this.authorBio);

  // Same threshold as the robots tag in loadPosts() - don't show an ad on a
  // page that's mostly empty (AdSense low-value-content / ad-density risk).
  isThinPage = computed(() => !this.isLoading() && this.posts().length < 5);

  get authorId(): string       { return (this.author() as any)?._id     ?? ''; }
  get authorName(): string    { return (this.author() as any)?.name     ?? 'Anonymous'; }
  get authorInitial(): string { return this.authorName.charAt(0).toUpperCase(); }
  get authorAvatar(): string  { return (this.author() as any)?.avatar   ?? ''; }
  get authorBio(): string     { return (this.author() as any)?.bio      ?? ''; }
  get joinedDate(): string    { return (this.author() as any)?.createdAt ?? ''; }
  get authorEmail(): string   { return (this.author() as any)?.email    ?? ''; }

  // Surfaces an author's LinkedIn/portfolio/company link as a visible
  // credential on their public profile - an E-E-A-T signal for reviewers,
  // not just internal sponsor bookkeeping (the `website` field already
  // exists on every user, previously only shown in the admin sponsor view).
  get authorWebsite(): string {
    const site = ((this.author() as any)?.website ?? '').trim();
    if (!site) return '';
    return /^https?:\/\//i.test(site) ? site : `https://${site}`;
  }
  get authorWebsiteLabel(): string {
    return this.authorWebsite.replace(/^https?:\/\//i, '').replace(/\/$/, '');
  }

  // Only real achievement backed by the API - the monthly writer badge
  // already awarded via the challenge feature (core/models User.writerOfMonthBadge).
  get writerBadgeActive(): boolean {
    return !!(this.author() as any)?.writerOfMonthBadge?.active;
  }
  get writerBadgeTitle(): string {
    return (this.author() as any)?.writerOfMonthBadge?.challengeTitle ?? 'Writer of the Month';
  }

  currentYear = new Date().getFullYear();
  protected readonly Math = Math;

  // Tracks which .adsbygoogle <ins> elements have already been pushed -
  // avoids re-pushing an already-initialised <ins> ("already have ads in
  // them") if pushAds() is ever called more than once.
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
    if (isPlatformBrowser(this.platformId) && sessionStorage.getItem(AuthorPage.NEWSLETTER_DISMISSED_KEY)) {
      this.showFloatingNewsletter.set(false);
    }

    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(params => {
      const id = params.get('id');
      if (!id) { this.router.navigate(['/']); return; }

      this.isLoading.set(true);
      this.notFound.set(false);
      this.author.set(null);
      this.posts.set([]);
      this.followersCount.set(0);
      this.followingCount.set(0);
      this.isFollowing.set(false);
      this.shorts.set([]);
      this.postsLoading.set(true);

      this.userService.getUserById(id)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (res) => {
            const user = res.data;
            if (!user) { this.notFound.set(true); this.isLoading.set(false); return; }
            this.author.set(user);
            this.followersCount.set((res as any).followersCount ?? 0);
            this.followingCount.set((res as any).followingCount ?? 0);
            this.isFollowing.set((res as any).isFollowing ?? false);
            this.totalViewsFromApi.set((res as any).totalViews ?? 0);
            this.totalLikesFromApi.set((res as any).totalLikes ?? 0);
            this.shortsCountFromApi.set((res as any).shortsCount ?? 0);
            this.totalBlogsFromApi.set((res as any).totalBlogs ?? 0);
            this.topPosts.set((res as any).topPosts ?? []);
            // Show the profile immediately - don't wait for posts/shorts to load
            this.isLoading.set(false);
            this.setMeta(user);
            this.loadPosts(id);
            this.loadShorts(id);
            setTimeout(() => this.pushAds(), 400);
          },
          error: () => { this.notFound.set(true); this.isLoading.set(false); },
        });
    });
  }

  ngOnDestroy(): void {
    this.document.getElementById('author-schema')?.remove();
    this.document.getElementById('author-itemlist')?.remove();
  }

  private loadShorts(authorId: string): void {
    this.shortsLoading.set(true);
    this.shortsService.getShortsByUser(authorId, 1, 50)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: res => { this.shorts.set(res.data ?? []); this.shortsLoading.set(false); },
        error: ()  => this.shortsLoading.set(false),
      });
  }

  private loadPosts(authorId: string): void {
    this.postService.getPostByUserId(authorId, 1, 100)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          const published = (res.data ?? []).filter((p: Post) => p.status === 'published');
          this.posts.set(published);
          this.postsLoading.set(false);
          this.injectAuthorItemList(published);
          const robotsValue = published.length >= 5 ? 'index, follow' : 'noindex, follow';
          this.meta.updateTag({ name: 'robots', content: robotsValue });
        },
        error: () => { this.postsLoading.set(false); },
      });
  }

  private injectAuthorItemList(posts: Post[]): void {
    if (!posts.length) return;
    const user = this.author();
    if (!user) return;
    const authorUrl = `${environment.siteUrl}/author/${(user as any)._id}`;
    const site      = environment.siteUrl;
    const itemList  = {
      '@context': 'https://schema.org',
      '@type':    'ItemList',
      '@id':      `${authorUrl}#itemlist`,
      name:       `Articles by ${(user as any).name} on ApnaInsights`,
      url:        authorUrl,
      numberOfItems: posts.length,
      itemListElement: posts.slice(0, 20).map((p, i) => ({
        '@type':   'ListItem',
        position:  i + 1,
        url:       `${site}/blog/${(p as any).slug || p._id}`,
        name:      p.title,
      })),
    };
    let el = this.document.getElementById('author-itemlist') as HTMLScriptElement | null;
    if (!el) {
      el      = this.document.createElement('script') as HTMLScriptElement;
      el.id   = 'author-itemlist';
      el.type = 'application/ld+json';
      this.document.head.appendChild(el);
    }
    el.textContent = JSON.stringify(itemList);
  }

  toggleFollow(): void {
    if (!this.isLoggedIn() || this.isOwnProfile() || this.followLoading()) return;
    this.followLoading.set(true);
    const authorId = (this.author() as any)?._id;
    const action$ = this.isFollowing()
      ? this.userService.unfollowUser(authorId)
      : this.userService.followUser(authorId);

    action$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (res) => {
        this.followersCount.set(res.data?.followersCount ?? this.followersCount());
        this.isFollowing.set(res.data?.isFollowing ?? !this.isFollowing());
        this.followLoading.set(false);
        this.userService.invalidate(authorId);
      },
      error: () => this.followLoading.set(false),
    });
  }

  private setMeta(user: User): void {
    const name = (user as any).name ?? 'Author';
    const bio  = (user as any).bio  ?? `${name} is a contributor on ApnaInsights, sharing expert guides and insights across topics like technology, lifestyle, health, and more. Explore their published articles below.`;
    const url  = `${environment.siteUrl}/author/${(user as any)._id}`;

    const hasAvatar = !!(user as any).avatar;
    const avatar = hasAvatar ? (user as any).avatar : environment.ogImage;
    const imgWidth  = hasAvatar ? '400'  : '1200';
    const imgHeight = hasAvatar ? '400'  : '630';

    this.titleSvc.setTitle(`${name} - Author | ApnaInsights`);
    this.meta.updateTag({ name: 'description',          content: bio });
    // Fail safe to noindex until loadPosts() confirms the author has enough
    // published posts - avoids a crawler ever seeing `index` on an
    // empty/thin author page (soft-404 risk).
    this.meta.updateTag({ name: 'robots',               content: 'noindex, follow' });
    this.meta.updateTag({ property: 'og:title',         content: `${name} - Author | ApnaInsights` });
    this.meta.updateTag({ property: 'og:description',   content: bio });
    this.meta.updateTag({ property: 'og:url',           content: url });
    this.meta.updateTag({ property: 'og:type',          content: 'profile' });
    this.meta.updateTag({ property: 'og:image',         content: avatar });
    this.meta.updateTag({ property: 'og:image:width',   content: imgWidth });
    this.meta.updateTag({ property: 'og:image:height',  content: imgHeight });
    this.meta.updateTag({ name: 'twitter:card',         content: 'summary' });
    this.meta.updateTag({ name: 'twitter:title',        content: `${name} - Author | ApnaInsights` });
    this.meta.updateTag({ name: 'twitter:description',  content: bio });
    this.meta.updateTag({ name: 'twitter:image',        content: avatar });

    // Person + BreadcrumbList structured data - @graph format
    const graph = {
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type':      'Person',
          '@id':        url,
          name,
          url,
          image: {
            '@type':   'ImageObject',
            url:       avatar,
            contentUrl: avatar,
          },
          description:  bio,
          // External credential (LinkedIn/portfolio) strengthens the E-E-A-T
          // signal beyond just linking back to our own profile URL.
          sameAs:       this.authorWebsite ? [url, this.authorWebsite] : [url],
          worksFor:     { '@id': `${environment.siteUrl}/#organization` },
        },
        {
          '@type': 'ProfilePage',
          '@id':   `${url}#webpage`,
          url,
          name:    `${name} - Author | ApnaInsights`,
          isPartOf: { '@id': `${environment.siteUrl}/#website` },
          mainEntity: { '@id': url },
          about:      { '@id': url },
          dateModified: new Date().toISOString(),
          inLanguage: 'en-IN',
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
    let sd = this.document.getElementById('author-schema') as HTMLScriptElement | null;
    if (!sd) {
      sd      = this.document.createElement('script');
      sd.id   = 'author-schema';
      sd.type = 'application/ld+json';
      this.document.head.appendChild(sd);
    }
    sd.textContent = JSON.stringify(graph);

    let canonical = this.document.querySelector('link[rel="canonical"]') as HTMLLinkElement;
    if (!canonical) {
      canonical = this.document.createElement('link');
      canonical.setAttribute('rel', 'canonical');
      this.document.head.appendChild(canonical);
    }
    canonical.setAttribute('href', url);
  }

  navigateToBlog(post: Post): void {
    this.router.navigate(['/blog', (post as any).slug || post._id]);
    if (isPlatformBrowser(this.platformId)) window.scrollTo({ top: 0, behavior: 'instant' });
  }

  readingTime(post: Post | undefined | null): number {
    if (!post) return 1;
    if (post.readingTimeMinutes) return post.readingTimeMinutes;
    if (!post.content) return 1;
    return Math.max(1, Math.ceil(post.content.replace(/<[^>]*>/g, '').trim().split(/\s+/).length / 200));
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

  toggleBio(): void { this.bioExpanded.set(!this.bioExpanded()); }

  showMoreArticles(): void { this.visibleArticles.set(this.visibleArticles() + 6); }

  async shareProfile(): Promise<void> {
    const author = this.author();
    if (!author || !isPlatformBrowser(this.platformId)) return;
    const url = `${environment.siteUrl}/author/${(author as any)._id}`;
    const data = { title: `${this.authorName} on ApnaInsights`, text: this.authorBio || this.authorName, url };
    if ((navigator as any).share) {
      try { await (navigator as any).share(data); return; } catch { /* cancelled */ }
    }
    try {
      await navigator.clipboard.writeText(url);
      this.shareCopied.set(true);
      setTimeout(() => this.shareCopied.set(false), 2000);
    } catch { /* ignore */ }
  }

  // Newsletter subscribe - same endpoint/pattern as the home page's inline
  // subscribe form (features/landing/pages/home/home.ts).
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
      AuthorPage.EMAIL_RE.test(value.trim()) ? '' : 'Please enter a valid email address'
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
}
