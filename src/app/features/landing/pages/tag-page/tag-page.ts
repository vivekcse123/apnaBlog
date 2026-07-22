import {
  ChangeDetectionStrategy, Component, DestroyRef, HostListener, OnInit, OnDestroy, PLATFORM_ID, computed, inject, signal
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { environment } from '../../../../../environments/environment';
import { CommonModule, DatePipe, isPlatformBrowser } from '@angular/common';
import { Meta, Title } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError } from 'rxjs/operators';
import { of } from 'rxjs';
import { PostService } from '../../../post/services/post-service';
import { AllPostsCache } from '../../../../core/services/all-posts-cache';
import { Post } from '../../../../core/models/post.model';
import { TimeAgoPipe } from '../../../../shared/pipes/time-ago-pipe';
import { MobileBottomNav } from '../../../../shared/mobile-bottom-nav/mobile-bottom-nav';
import { SiteHeader } from '../../../../shared/site-header/site-header';
import { Auth } from '../../../../core/services/auth';
import { BookmarkService } from '../../../../core/services/bookmark.service';

@Component({
  selector: 'app-tag-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, CommonModule, DatePipe, TimeAgoPipe, MobileBottomNav, SiteHeader],
  templateUrl: './tag-page.html',
  styleUrl: './tag-page.css',
})
export class TagPage implements OnInit, OnDestroy {
  private route         = inject(ActivatedRoute);
  private router        = inject(Router);
  private postService   = inject(PostService);
  private allPostsCache = inject(AllPostsCache);
  private destroyRef    = inject(DestroyRef);
  private platformId  = inject(PLATFORM_ID);
  private meta        = inject(Meta);
  private titleSvc    = inject(Title);
  private document    = inject(DOCUMENT);
  private auth        = inject(Auth);
  bookmarkService      = inject(BookmarkService);

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

  tagSlug  = signal('');
  allPosts = signal<Post[]>([]);
  isLoading = signal(true);

  posts = computed(() => {
    const tag = this.tagSlug().toLowerCase();
    return this.allPosts()
      .filter(p =>
        p.status === 'published' &&
        Array.isArray(p.tags) &&
        p.tags.some(t => t.toLowerCase() === tag)
      )
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  });

  currentYear = new Date().getFullYear();

  // Same threshold as _updateRobotsForPostCount() - don't show an ad on a
  // page that's mostly empty (AdSense low-value-content / ad-density risk).
  isThinPage = computed(() => !this.isLoading() && this.posts().length < 5);

  // Renders posts in batches instead of the full (sometimes 100s-long) list -
  // popular tags were producing multi-MB prerendered HTML. All posts are
  // already in memory (allPostsCache), so "Load more" is instant, no refetch.
  private readonly PAGE_SIZE = 24;
  displayCount = signal(this.PAGE_SIZE);
  visiblePosts = computed(() => this.posts().slice(0, this.displayCount()));
  hasMorePosts = computed(() => this.posts().length > this.displayCount());

  loadMore(): void {
    this.displayCount.update(n => n + this.PAGE_SIZE);
  }

  // Tracks which .adsbygoogle <ins> elements have already been pushed -
  // tag route params can re-fire (e.g. switching tags), and re-pushing an
  // already-initialised <ins> throws "already have ads in them".
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
      const tag = params.get('tag') ?? '';
      if (!tag) { this.router.navigate(['/']); return; }

      this.tagSlug.set(tag.toLowerCase());
      this.displayCount.set(this.PAGE_SIZE);
      this.setMeta(tag);
      this.loadPosts();
      setTimeout(() => this.pushAds(), 300);
    });
  }

  ngOnDestroy(): void {
    this.document.getElementById('tag-schema')?.remove();
    this.document.getElementById('tag-itemlist')?.remove();
  }

  private loadPosts(): void {
    const cached = this.allPostsCache.get();
    if (cached.length) {
      this.allPosts.set(cached);
      this.isLoading.set(false);
      this.injectItemList(this.posts());
      this._updateRobotsForPostCount(this.posts().length);
      this._enrichMetaWithTopCategory();
      this._setOgImage();
      return;
    }

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
        this.injectItemList(this.posts());
        this._updateRobotsForPostCount(this.posts().length);
        this._enrichMetaWithTopCategory();
        this._setOgImage();
      });
  }

  // Once the tag's real posts are in, swap the generic sitewide og:image for
  // the most recent post's own featured image - same fallback pattern as
  // blog-detail.ts and category-page.ts's setOgImage().
  private _setOgImage(): void {
    const image = this.posts()[0]?.featuredImage || environment.ogImage;
    this.meta.updateTag({ property: 'og:image', content: image });
    this.meta.updateTag({ name: 'twitter:image', content: image });
  }

  private _updateRobotsForPostCount(count: number): void {
    const value = count >= 5 ? 'index, follow' : 'noindex, follow';
    this.meta.updateTag({ name: 'robots', content: value });
  }

  // Differentiates near-identical tag-page descriptions by folding in the
  // tag's most common category (e.g. "...Technology community blogs...")
  // once posts are loaded - avoids duplicate-meta-description across tags.
  private _enrichMetaWithTopCategory(): void {
    const posts = this.posts();
    if (!posts.length) return;

    const counts = new Map<string, number>();
    for (const p of posts) {
      for (const c of (p.categories ?? [])) {
        counts.set(c, (counts.get(c) ?? 0) + 1);
      }
    }
    const topCategory = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    if (!topCategory) return;

    const tag     = this.tagSlug();
    const display = tag.charAt(0).toUpperCase() + tag.slice(1);
    const desc    = `Read the latest #${display} stories on ApnaInsights - ${topCategory} guides and insights from Indian contributors.`;

    this.meta.updateTag({ name: 'description',        content: desc });
    this.meta.updateTag({ property: 'og:description', content: desc });
  }

  private setMeta(tag: string): void {
    const display = tag.charAt(0).toUpperCase() + tag.slice(1);
    const url     = `${environment.siteUrl}/tag/${tag.toLowerCase()}`;

    const desc = `Read the latest stories tagged #${display} on ApnaInsights - guides and insights written by real contributors.`;
    this.titleSvc.setTitle(`#${display} Stories | ApnaInsights`);
    this.meta.updateTag({ name: 'description',        content: desc });
    // Fail safe to noindex until _updateRobotsForPostCount() confirms the tag
    // has enough posts - avoids a crawler ever seeing `index` on an
    // empty/thin tag page (soft-404 risk).
    this.meta.updateTag({ name: 'robots',             content: 'noindex, follow' });
    this.meta.updateTag({ property: 'og:title',       content: `#${display} Stories | ApnaInsights` });
    this.meta.updateTag({ property: 'og:description', content: desc });
    this.meta.updateTag({ property: 'og:url',         content: url });
    this.meta.updateTag({ property: 'og:type',        content: 'website' });
    this.meta.updateTag({ property: 'og:image',        content: environment.ogImage });
    this.meta.updateTag({ property: 'og:image:width',  content: '1200' });
    this.meta.updateTag({ property: 'og:image:height', content: '630' });
    this.meta.updateTag({ property: 'og:image:alt',    content: `#${display} Stories | ApnaInsights` });
    this.meta.updateTag({ name: 'twitter:card',        content: 'summary_large_image' });
    this.meta.updateTag({ name: 'twitter:title',       content: `#${display} Stories | ApnaInsights` });
    this.meta.updateTag({ name: 'twitter:description', content: desc });
    this.meta.updateTag({ name: 'twitter:image',       content: environment.ogImage });

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
          '@type':    'CollectionPage',
          '@id':      `${url}#webpage`,
          url,
          name:       `#${display} Stories`,
          description: `Read the latest stories tagged #${display} on ApnaInsights - guides and insights from verified contributors.`,
          inLanguage: 'en-IN',
          isPartOf:   { '@id': `${environment.siteUrl}/#website` },
          publisher:  { '@id': `${environment.siteUrl}/#organization` },
        },
        {
          '@type':         'BreadcrumbList',
          '@id':           `${url}#breadcrumb`,
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Home',         item: environment.siteUrl },
            { '@type': 'ListItem', position: 2, name: `#${display}`,  item: url },
          ],
        },
      ],
    };
    let el = this.document.getElementById('tag-schema');
    if (!el) {
      el    = this.document.createElement('script');
      el.id = 'tag-schema';
      (el as HTMLScriptElement).type = 'application/ld+json';
      this.document.head.appendChild(el);
    }
    el.textContent = JSON.stringify(graph);
  }

  private injectItemList(posts: any[]): void {
    if (!posts.length) return;
    const url  = `${environment.siteUrl}/tag/${this.tagSlug()}`;
    const site = environment.siteUrl;
    const tag  = this.tagSlug();
    const display = tag.charAt(0).toUpperCase() + tag.slice(1);
    const itemList = {
      '@context': 'https://schema.org',
      '@type':    'ItemList',
      '@id':      `${url}#itemlist`,
      name:       `#${display} Stories on ApnaInsights`,
      url,
      numberOfItems: posts.length,
      itemListElement: posts.slice(0, 20).map((p: any, i: number) => ({
        '@type':    'ListItem',
        position:   i + 1,
        url:        `${site}/blog/${p.slug || p._id}`,
        name:       p.title,
      })),
    };
    let el = this.document.getElementById('tag-itemlist');
    if (!el) {
      el    = this.document.createElement('script');
      el.id = 'tag-itemlist';
      (el as HTMLScriptElement).type = 'application/ld+json';
      this.document.head.appendChild(el);
    }
    el.textContent = JSON.stringify(itemList);
  }

  navigateToBlog(post: Post): void {
    this.router.navigate(['/blog', (post as any).slug || post._id]);
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
