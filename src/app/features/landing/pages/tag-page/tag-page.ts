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

@Component({
  selector: 'app-tag-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, CommonModule, DatePipe, TimeAgoPipe],
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

  ngOnInit(): void {
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(params => {
      const tag = params.get('tag') ?? '';
      if (!tag) { this.router.navigate(['/']); return; }

      this.tagSlug.set(tag.toLowerCase());
      this.setMeta(tag);
      this.loadPosts();
    });
  }

  private loadPosts(): void {
    const cached = this.allPostsCache.get();
    if (cached.length) {
      this.allPosts.set(cached);
      this.isLoading.set(false);
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
      });
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

    const schema = [
      {
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        name: `#${display} Stories`,
        description: `Read the latest #${display} stories on ApnaInsights.`,
        url,
        isPartOf: { '@type': 'WebSite', url: environment.siteUrl, name: 'ApnaInsights' },
      },
      {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: environment.siteUrl },
          { '@type': 'ListItem', position: 2, name: `#${display}`, item: url },
        ],
      },
    ];
    let el = this.document.getElementById('tag-schema');
    if (!el) {
      el = this.document.createElement('script');
      el.id = 'tag-schema';
      (el as HTMLScriptElement).type = 'application/ld+json';
      this.document.head.appendChild(el);
    }
    el.textContent = JSON.stringify(schema);
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
