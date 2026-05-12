import {
  Component, OnInit, inject, signal, computed, DestroyRef, PLATFORM_ID, HostListener,
  ChangeDetectionStrategy
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CommonModule, DatePipe, isPlatformBrowser } from '@angular/common';
import { Meta, Title } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError } from 'rxjs/operators';
import { of } from 'rxjs';
import { PostService }    from '../../../post/services/post-service';
import { AllPostsCache }  from '../../../../core/services/all-posts-cache';
import { TaxonomyService } from '../../../../core/services/taxonomy.service';
import { Post }           from '../../../../core/models/post.model';
import { TimeAgoPipe }    from '../../../../shared/pipes/time-ago-pipe';

const FALLBACK_CATEGORIES: string[] = [
  'Update', 'News', 'Sports', 'Entertainment', 'Health', 'Technology', 'Business',
  'Lifestyle', 'Education', 'Exercise', 'Cooking', 'Social', 'Quotes', 'Village',
];

@Component({
  selector: 'app-category-page',
  standalone: true,
  imports: [RouterLink, CommonModule, DatePipe, TimeAgoPipe],
  templateUrl: './category-page.html',
  styleUrl: './category-page.css',
})
export class CategoryPage implements OnInit {
  private route           = inject(ActivatedRoute);
  private router          = inject(Router);
  private postService     = inject(PostService);
  private allPostsCache   = inject(AllPostsCache);
  private taxonomyService = inject(TaxonomyService);
  private destroyRef      = inject(DestroyRef);
  private platformId  = inject(PLATFORM_ID);
  private meta        = inject(Meta);
  private titleSvc    = inject(Title);
  private document    = inject(DOCUMENT);

  categorySlug    = signal('');
  categoryName    = signal('');
  allPosts        = signal<Post[]>([]);
  isLoading       = signal(true);
  showCatDropdown = signal(false);

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
        p.categories?.some(c => c.toLowerCase() === name)
      )
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  });

  currentYear = new Date().getFullYear();

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
      this.setMeta(matched);
      this.loadPosts();
    });
  }

  private loadPosts(): void {
    // Instant render from shared cache (populated by home page fetchAccurateStats)
    const cached = this.allPostsCache.get();
    if (cached.length) {
      this.allPosts.set(cached);
      this.isLoading.set(false);
      return;
    }

    // Direct navigation / hard refresh — fetch all pages ourselves
    this.isLoading.set(true);
    this.postService.getAllPublished()
      .pipe(
        catchError(() => of([] as Post[])),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(posts => {
        this.allPostsCache.set(posts);   // populate for future navigations
        this.allPosts.set(posts);
        this.isLoading.set(false);
      });
  }

  private setMeta(name: string): void {
    const url = `https://apnainsights.com/category/${name.toLowerCase()}`;
    this.titleSvc.setTitle(`${name} Stories & Blogs | ApnaInsights`);
    this.meta.updateTag({ name: 'description', content: `Read the latest ${name} stories, blogs, and insights from real writers on ApnaInsights. Community-driven content on ${name}.` });
    this.meta.updateTag({ name: 'robots', content: 'index, follow' });
    this.meta.updateTag({ property: 'og:title',       content: `${name} Stories & Blogs | ApnaInsights` });
    this.meta.updateTag({ property: 'og:description', content: `Explore ${name} content written by real people on ApnaInsights.` });
    this.meta.updateTag({ property: 'og:url',         content: url });
    this.meta.updateTag({ property: 'og:type',        content: 'website' });

    let canonical = this.document.querySelector('link[rel="canonical"]') as HTMLLinkElement;
    if (!canonical) {
      canonical = this.document.createElement('link');
      canonical.setAttribute('rel', 'canonical');
      this.document.head.appendChild(canonical);
    }
    canonical.setAttribute('href', url);

    // Breadcrumb + CollectionPage structured data
    const schema = [
      {
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        'name': `${name} Stories & Blogs`,
        'description': `Read the latest ${name} stories and blogs on ApnaInsights.`,
        'url': url,
        'isPartOf': { '@type': 'WebSite', 'url': 'https://apnainsights.com', 'name': 'ApnaInsights' },
      },
      {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        'itemListElement': [
          { '@type': 'ListItem', 'position': 1, 'name': 'Home',  'item': 'https://apnainsights.com' },
          { '@type': 'ListItem', 'position': 2, 'name': name,    'item': url },
        ],
      },
    ];
    let el = this.document.getElementById('category-schema');
    if (!el) {
      el = this.document.createElement('script');
      el.id = 'category-schema';
      (el as HTMLScriptElement).type = 'application/ld+json';
      this.document.head.appendChild(el);
    }
    el.textContent = JSON.stringify(schema);
  }

  navigateToBlog(post: Post): void {
    this.router.navigate(['/blog', post.slug || post._id]);
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
