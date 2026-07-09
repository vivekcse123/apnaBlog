import {
  Component, OnInit, OnDestroy, inject, signal, computed, DestroyRef, PLATFORM_ID,
  ChangeDetectionStrategy
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { isPlatformBrowser, NgTemplateOutlet } from '@angular/common';
import { DomSanitizer, Meta, SafeHtml, Title } from '@angular/platform-browser';
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
  'Lifestyle', 'Education', 'Exercise', 'Social', 'Village',
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
  Village:       { emoji: '🏡', description: 'Rural India stories, farming wisdom, local culture and traditions.',        color: '#A16207' },
  Social:        { emoji: '🤝', description: 'Social issues, community voices and conversations modern India needs.',     color: '#EC4899' },
  Exercise:      { emoji: '💪', description: 'Gym routines, yoga guides, running diaries and fitness transformations.',   color: '#06B6D4' },
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
  imports: [RouterLink, NgTemplateOutlet, MobileBottomNav],
  templateUrl: './all-topics.html',
  styleUrl: './all-topics.css',
})
export class AllTopicsPage implements OnInit, OnDestroy {
  private allPostsCache   = inject(AllPostsCache);
  private postService     = inject(PostService);
  private taxonomyService = inject(TaxonomyService);
  private destroyRef      = inject(DestroyRef);
  private platformId      = inject(PLATFORM_ID);
  private sanitizer       = inject(DomSanitizer);
  private meta            = inject(Meta);
  private titleSvc        = inject(Title);
  private document        = inject(DOCUMENT);

  private readonly ICONS: Record<string, string> = {
    Technology:    `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>`,
    Health:        `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`,
    Sports:        `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="6"/><path d="M15.477 12.89L17 22l-5-3-5 3 1.523-9.11"/></svg>`,
    Business:      `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/></svg>`,
    Lifestyle:     `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`,
    Education:     `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>`,
    Entertainment: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="2.18"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="2" y1="7" x2="7" y2="7"/><line x1="2" y1="17" x2="7" y2="17"/><line x1="17" y1="17" x2="22" y2="17"/><line x1="17" y1="7" x2="22" y2="7"/></svg>`,
    Village:       `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`,
    Social:        `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
    Exercise:      `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>`,
    News:          `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>`,
    Update:        `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>`,
    Career:        `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>`,
    AI:            `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/><line x1="9" y1="20" x2="9" y2="23"/><line x1="15" y1="20" x2="15" y2="23"/><line x1="20" y1="9" x2="23" y2="9"/><line x1="20" y1="14" x2="23" y2="14"/><line x1="1" y1="9" x2="4" y2="9"/><line x1="1" y1="14" x2="4" y2="14"/></svg>`,
    Finance:       `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>`,
    Productivity:  `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>`,
  };

  getIcon(name: string): SafeHtml {
    const svg = this.ICONS[name]
      ?? `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`;
    return this.sanitizer.bypassSecurityTrustHtml(svg);
  }

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

  trendingTopics = computed<TopicCard[]>(() =>
    [...this.topics()]
      .filter(t => t.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 6)
  );

  activeTags = computed(() => this.taxonomyService.tags());

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
