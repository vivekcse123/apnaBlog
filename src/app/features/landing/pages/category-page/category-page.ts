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

const CATEGORY_DESCRIPTIONS: Record<string, { description: string; intro: string }> = {
  'News':          {
    description: 'Stay updated with the latest news, current events, and breaking stories from across India and the world, written by real community journalists on ApnaInsights.',
    intro:       'Real news and current events written by community voices — from local happenings to national headlines, unfiltered and authentic.'
  },
  'Update':        {
    description: 'Platform announcements, new features, and community news from the ApnaInsights team. Stay informed about what\'s new on the platform.',
    intro:       'The latest announcements, feature updates, and community highlights straight from the ApnaInsights team.'
  },
  'Technology':    {
    description: 'Explore technology trends, software reviews, AI insights, coding tutorials, and tech innovations written by Indian developers and tech enthusiasts on ApnaInsights.',
    intro:       'From AI breakthroughs to coding tutorials and gadget reviews — technology stories written by developers and enthusiasts who live and breathe tech.'
  },
  'Health':        {
    description: 'Discover health tips, wellness advice, fitness guides, mental health stories, and medical insights from real people sharing their health journeys on ApnaInsights.',
    intro:       'Real health journeys, expert wellness tips, mental health stories, and everyday health advice written by people who\'ve been there.'
  },
  'Sports':        {
    description: 'Read cricket, football, kabaddi, and all sports stories, match analyses, player profiles, and sports news from passionate fans on ApnaInsights.',
    intro:       'Cricket, football, kabaddi and beyond — match analyses, player profiles, and sports opinions from fans who live for the game.'
  },
  'Village':       {
    description: 'Real stories from rural India — village life, farming wisdom, local culture, traditions, and authentic voices from the heartland of India on ApnaInsights.',
    intro:       'Authentic stories from rural India — farming wisdom, village traditions, local culture, and the heartbeat of communities you rarely hear about.'
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
  'Cooking':       {
    description: 'Authentic Indian recipes, cooking tips, food stories, regional cuisines, and kitchen adventures from home cooks and food lovers across India on ApnaInsights.',
    intro:       'Authentic recipes, regional cuisines, kitchen hacks, and food stories from home cooks who believe every meal tells a story.'
  },
  'Exercise':      {
    description: 'Workout routines, gym tips, yoga guides, running stories, and personal fitness journeys from health-conscious writers sharing their experiences on ApnaInsights.',
    intro:       'Gym routines, yoga guides, running diaries, and personal fitness transformations from people who chose to make health a priority.'
  },
  'Social':        {
    description: 'Social issues, community stories, cultural observations, human interest pieces, and important conversations about modern Indian society on ApnaInsights.',
    intro:       'Social issues, community voices, cultural observations, and human interest stories that spark the conversations modern India needs to have.'
  },
  'Quotes':        {
    description: 'Inspiring quotes, motivational sayings, life wisdom, and thought-provoking words with context and reflection from writers across India on ApnaInsights.',
    intro:       'Inspiring quotes and motivational wisdom — not just words, but the stories and reflections behind them from writers across India.'
  },
};

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
  categoryIntro   = signal('');
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
      this.applyRobotsForCount();
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
        this.allPostsCache.set(posts);
        this.allPosts.set(posts);
        this.isLoading.set(false);
        this.applyRobotsForCount();
      });
  }

  // Mark thin category pages noindex so they don't hurt AdSense review.
  // Categories with fewer than 5 published posts don't have enough content
  // to provide value to a visitor — indexing them works against us.
  private applyRobotsForCount(): void {
    const count = this.posts().length;
    const robots = count >= 5 ? 'index, follow' : 'noindex, follow';
    this.meta.updateTag({ name: 'robots', content: robots });
  }

  private setMeta(name: string): void {
    const url   = `https://apnainsights.com/category/${name.toLowerCase()}`;
    const info  = CATEGORY_DESCRIPTIONS[name];
    const desc  = info?.description ?? `Read the latest ${name} stories, blogs, and insights from real writers on ApnaInsights. Community-driven content on ${name}.`;
    const intro = info?.intro ?? '';

    this.categoryIntro.set(intro);
    this.titleSvc.setTitle(`${name} Stories & Blogs | ApnaInsights`);
    this.meta.updateTag({ name: 'description',        content: desc });
    this.meta.updateTag({ name: 'robots',             content: 'index, follow' }); // may be overridden after load
    this.meta.updateTag({ property: 'og:title',       content: `${name} Stories & Blogs | ApnaInsights` });
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
