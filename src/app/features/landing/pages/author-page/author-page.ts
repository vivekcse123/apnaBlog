import {
  ChangeDetectionStrategy, Component, DestroyRef, OnInit, OnDestroy, PLATFORM_ID, computed, inject, signal
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { environment } from '../../../../../environments/environment';
import { CommonModule, DatePipe, isPlatformBrowser } from '@angular/common';
import { Meta, Title } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
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

@Component({
  selector: 'app-author-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, CommonModule, DatePipe, TimeAgoPipe, MobileBottomNav],
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
  private destroyRef  = inject(DestroyRef);
  private platformId  = inject(PLATFORM_ID);
  private meta        = inject(Meta);
  private titleSvc    = inject(Title);
  private document    = inject(DOCUMENT);

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
  selectedTab     = signal<'posts' | 'shorts' | 'about'>('posts');

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

  // Same threshold as the robots tag in loadPosts() - don't show an ad on a
  // page that's mostly empty (AdSense low-value-content / ad-density risk).
  isThinPage = computed(() => !this.isLoading() && this.posts().length < 5);

  get authorName(): string    { return (this.author() as any)?.name     ?? 'Anonymous'; }
  get authorInitial(): string { return this.authorName.charAt(0).toUpperCase(); }
  get authorAvatar(): string  { return (this.author() as any)?.avatar   ?? ''; }
  get authorBio(): string     { return (this.author() as any)?.bio      ?? ''; }
  get joinedDate(): string    { return (this.author() as any)?.createdAt ?? ''; }
  get authorEmail(): string   { return (this.author() as any)?.email    ?? ''; }

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
          const published = (res.data ?? []).filter((p: Post) => p.status === 'published' || p.status === 'draft');
          this.posts.set(published);
          this.injectAuthorItemList(published);
          const robotsValue = published.length >= 5 ? 'index, follow' : 'noindex, follow';
          this.meta.updateTag({ name: 'robots', content: robotsValue });
        },
        error: () => {},
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
          sameAs:       [url],
          worksFor:     { '@id': `${environment.siteUrl}/#organization` },
        },
        {
          '@type': 'ProfilePage',
          '@id':   `${url}#webpage`,
          url,
          name:    `${name} - Author | ApnaInsights`,
          isPartOf: { '@id': `${environment.siteUrl}/#website` },
          about:   { '@id': url },
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

  readingTime(content: string): number {
    return Math.max(1, Math.ceil(content.replace(/<[^>]*>/g, '').trim().split(/\s+/).length / 200));
  }

  fmtCount(n: number): string {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
    if (n >= 1_000)     return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
    return String(n);
  }
}
