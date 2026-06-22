import {
  Component, OnInit, OnDestroy, inject, signal, computed, DestroyRef, PLATFORM_ID,
  ChangeDetectionStrategy
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { isPlatformBrowser } from '@angular/common';
import { Meta, Title } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { environment } from '../../../../../environments/environment';
import { AllPostsCache } from '../../../../core/services/all-posts-cache';
import { TaxonomyService } from '../../../../core/services/taxonomy.service';
import { PostService } from '../../../post/services/post-service';
import { Post } from '../../../../core/models/post.model';
import { MobileBottomNav } from '../../../../shared/mobile-bottom-nav/mobile-bottom-nav';
import { catchError } from 'rxjs/operators';
import { of } from 'rxjs';

export interface TopicCard {
  name: string;
  emoji: string;
  description: string;
  count: number;
  slug: string;
  color: string;
}

const FALLBACK_CATEGORIES: string[] = [
  'Update', 'News', 'Sports', 'Entertainment', 'Health', 'Technology', 'Business',
  'Lifestyle', 'Education', 'Exercise', 'Cooking', 'Social', 'Quotes', 'Village',
  'Career', 'AI', 'Finance', 'Productivity',
];

const CATEGORY_META: Record<string, { emoji: string; description: string; color: string }> = {
  Technology:    { emoji: '💻', description: 'AI, coding, gadgets, software reviews and tech innovations.',              color: '#2563EB' },
  Health:        { emoji: '❤️', description: 'Wellness tips, mental health stories and everyday health advice.',          color: '#EF4444' },
  Sports:        { emoji: '🏏', description: 'Cricket, football, kabaddi, match analyses and sports opinions.',           color: '#F59E0B' },
  Business:      { emoji: '💼', description: 'Startup journeys, entrepreneurship, career advice and investment tips.',    color: '#7C3AED' },
  Lifestyle:     { emoji: '🌿', description: 'Travel diaries, personal growth, home décor and everyday life across India.',color: '#10B981' },
  Education:     { emoji: '📚', description: 'Study tips, exam prep, college life and career guidance.',                  color: '#0EA5E9' },
  Entertainment: { emoji: '🎬', description: 'Bollywood reviews, OTT opinions, celebrity stories and pop culture.',       color: '#F97316' },
  Cooking:       { emoji: '🍛', description: 'Authentic recipes, regional cuisines, kitchen hacks and food stories.',     color: '#84CC16' },
  Village:       { emoji: '🏡', description: 'Rural India stories, farming wisdom, local culture and traditions.',        color: '#A16207' },
  Social:        { emoji: '🤝', description: 'Social issues, community voices and conversations modern India needs.',     color: '#EC4899' },
  Exercise:      { emoji: '💪', description: 'Gym routines, yoga guides, running diaries and fitness transformations.',   color: '#06B6D4' },
  Quotes:        { emoji: '💬', description: 'Inspiring quotes and motivational wisdom with stories behind them.',        color: '#8B5CF6' },
  News:          { emoji: '📰', description: 'Current events, breaking stories and community journalism.',               color: '#64748B' },
  Update:        { emoji: '📢', description: 'Platform announcements, new features and community highlights.',           color: '#059669' },
  Career:        { emoji: '💼', description: 'Job interviews, salary tips, career switches and real workplace stories.',  color: '#0F766E' },
  AI:            { emoji: '🤖', description: 'Practical guides on ChatGPT, Gemini and AI tools for Indian professionals.',color: '#7C3AED' },
  Finance:       { emoji: '💰', description: 'Personal finance, tax-saving, investments and money advice for India.',     color: '#CA8A04' },
  Productivity:  { emoji: '⚡', description: 'Time management, focus systems and tools that working professionals use.',  color: '#0369A1' },
};

@Component({
  selector: 'app-all-topics',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, MobileBottomNav],
  templateUrl: './all-topics.html',
  styleUrl: './all-topics.css',
})
export class AllTopicsPage implements OnInit, OnDestroy {
  private allPostsCache   = inject(AllPostsCache);
  private postService     = inject(PostService);
  private taxonomyService = inject(TaxonomyService);
  private destroyRef      = inject(DestroyRef);
  private platformId      = inject(PLATFORM_ID);
  private meta            = inject(Meta);
  private titleSvc        = inject(Title);
  private document        = inject(DOCUMENT);

  allPosts  = signal<Post[]>([]);
  isLoading = signal(true);

  currentYear = new Date().getFullYear();

  ALL_CATEGORIES = computed<string[]>(() => {
    const names = this.taxonomyService.categoryNames();
    return names.length ? names : FALLBACK_CATEGORIES;
  });

  topics = computed<TopicCard[]>(() => {
    const posts = this.allPosts();
    return this.ALL_CATEGORIES().map(name => {
      const m     = CATEGORY_META[name] ?? { emoji: '📌', description: `Stories and articles about ${name}.`, color: '#6B7280' };
      const count = posts.filter(p =>
        p.status === 'published' &&
        p.categories?.some(c => c.toLowerCase() === name.toLowerCase())
      ).length;
      return { name, emoji: m.emoji, description: m.description, color: m.color, count, slug: name.toLowerCase() };
    });
  });

  ngOnInit(): void {
    this.taxonomyService.load().pipe(takeUntilDestroyed(this.destroyRef)).subscribe();
    this.setMeta();

    const cached = this.allPostsCache.get();
    if (cached.length) {
      this.allPosts.set(cached);
      this.isLoading.set(false);
      return;
    }

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

    if (isPlatformBrowser(this.platformId)) {
      setTimeout(() => this.pushAds(), 300);
    }
  }

  private pushAds(): void {
    try {
      const ads: any[] = (window as any).adsbygoogle ?? [];
      (window as any).adsbygoogle = ads;
      this.document.querySelectorAll('.page-ad-wrap ins.adsbygoogle').forEach(el => {
        ads.push({});
      });
    } catch (_) {}
  }

  private setMeta(): void {
    const url  = `${environment.siteUrl}/topics`;
    const desc = 'Explore all topics on ApnaInsights - Technology, Health, Sports, Business, Lifestyle, Education, Entertainment and more. Find stories that matter to you.';

    this.titleSvc.setTitle('Explore All Topics | ApnaInsights');
    this.meta.updateTag({ name: 'description',        content: desc });
    this.meta.updateTag({ name: 'robots',             content: 'index, follow' });
    this.meta.updateTag({ property: 'og:title',       content: 'Explore All Topics | ApnaInsights' });
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
          name: 'Explore All Topics',
          description: desc,
          inLanguage: 'en-IN',
          isPartOf: { '@id': `${environment.siteUrl}/#website` },
          publisher: { '@id': `${environment.siteUrl}/#organization` },
        },
        {
          '@type':         'BreadcrumbList',
          '@id':           `${url}#breadcrumb`,
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Home',   item: environment.siteUrl },
            { '@type': 'ListItem', position: 2, name: 'Topics', item: url },
          ],
        },
      ],
    };
    let el = this.document.getElementById('topics-schema');
    if (!el) {
      el = this.document.createElement('script');
      el.id = 'topics-schema';
      (el as HTMLScriptElement).type = 'application/ld+json';
      this.document.head.appendChild(el);
    }
    el.textContent = JSON.stringify(graph);
  }

  ngOnDestroy(): void {
    this.document.getElementById('topics-schema')?.remove();
  }

  scrollToTop(): void {
    if (isPlatformBrowser(this.platformId)) window.scrollTo({ top: 0, behavior: 'instant' });
  }
}
