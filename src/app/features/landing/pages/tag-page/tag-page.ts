import {
  ChangeDetectionStrategy, Component, DestroyRef, HostListener, OnInit, PLATFORM_ID, computed, inject, signal
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

@Component({
  selector: 'app-tag-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, CommonModule, DatePipe, TimeAgoPipe, MobileBottomNav],
  templateUrl: './tag-page.html',
  styleUrl: './tag-page.css',
})
export class TagPage implements OnInit {
  private route         = inject(ActivatedRoute);
  private router        = inject(Router);
  private postService   = inject(PostService);
  private allPostsCache = inject(AllPostsCache);
  private destroyRef    = inject(DestroyRef);
  private platformId  = inject(PLATFORM_ID);
  private meta        = inject(Meta);
  private titleSvc    = inject(Title);
  private document    = inject(DOCUMENT);

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

  private pushAds(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    try {
      const ads: any[] = (window as any).adsbygoogle ?? [];
      (window as any).adsbygoogle = ads;
      this.document.querySelectorAll('.page-ad-wrap ins.adsbygoogle').forEach(() => ads.push({}));
    } catch (_) {}
  }

  ngOnInit(): void {
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(params => {
      const tag = params.get('tag') ?? '';
      if (!tag) { this.router.navigate(['/']); return; }

      this.tagSlug.set(tag.toLowerCase());
      this.setMeta(tag);
      this.loadPosts();
      setTimeout(() => this.pushAds(), 300);
    });
  }

  private loadPosts(): void {
    const cached = this.allPostsCache.get();
    if (cached.length) {
      this.allPosts.set(cached);
      this.isLoading.set(false);
      this.injectItemList(this.posts());
      this._updateRobotsForPostCount(this.posts().length);
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
      });
  }

  private _updateRobotsForPostCount(count: number): void {
    const value = count >= 5 ? 'index, follow' : 'noindex, follow';
    this.meta.updateTag({ name: 'robots', content: value });
  }

  private setMeta(tag: string): void {
    const display = tag.charAt(0).toUpperCase() + tag.slice(1);
    const url     = `${environment.siteUrl}/tag/${tag.toLowerCase()}`;

    this.titleSvc.setTitle(`#${display} Stories | ApnaInsights`);
    this.meta.updateTag({ name: 'description',        content: `Read the latest stories tagged #${display} on ApnaInsights — community blogs written by real people.` });
    this.meta.updateTag({ name: 'robots',             content: 'index, follow' });
    this.meta.updateTag({ property: 'og:title',       content: `#${display} Stories | ApnaInsights` });
    this.meta.updateTag({ property: 'og:description', content: `Explore #${display} content on ApnaInsights.` });
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
          '@type':    'CollectionPage',
          '@id':      `${url}#webpage`,
          url,
          name:       `#${display} Stories`,
          description: `Read the latest stories tagged #${display} on ApnaInsights — community blogs from real writers.`,
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

  private rtCache = new Map<string, number>();
  readingTime(post: Post): number {
    const id = post._id;
    if (this.rtCache.has(id)) return this.rtCache.get(id)!;
    const mins = Math.max(1, Math.ceil(
      (post.content ?? '').replace(/<[^>]*>/g, '').trim().split(/\s+/).length / 200
    ));
    this.rtCache.set(id, mins);
    return mins;
  }
}
