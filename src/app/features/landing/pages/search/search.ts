import {
  Component, inject, signal, computed, OnInit,
  DestroyRef, PLATFORM_ID, ChangeDetectionStrategy,
} from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CommonModule, isPlatformBrowser, Location } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { debounceTime, distinctUntilChanged, Subject, switchMap } from 'rxjs';
import { Meta, Title } from '@angular/platform-browser';
import { HttpClient } from '@angular/common/http';
import { PostService } from '../../../post/services/post-service';
import { AllPostsCache } from '../../../../core/services/all-posts-cache';
import { Post } from '../../../../core/models/post.model';
import { catchError } from 'rxjs/operators';
import { of } from 'rxjs';
import { TimeAgoPipe } from '../../../../shared/pipes/time-ago-pipe';
import { environment } from '../../../../../environments/environment';
import { MobileBottomNav } from '../../../../shared/mobile-bottom-nav/mobile-bottom-nav';

@Component({
  selector: 'app-search',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule, TimeAgoPipe, MobileBottomNav],
  templateUrl: './search.html',
  styleUrl: './search.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SearchPage implements OnInit {
  private route         = inject(ActivatedRoute);
  private router        = inject(Router);
  private location      = inject(Location);
  private http          = inject(HttpClient);
  private postService   = inject(PostService);
  private allPostsCache = inject(AllPostsCache);
  private destroyRef    = inject(DestroyRef);
  private platformId    = inject(PLATFORM_ID);
  private document      = inject(DOCUMENT);
  private meta          = inject(Meta);
  private titleSvc      = inject(Title);

  query        = signal('');
  allPosts     = signal<Post[]>([]);
  isLoading    = signal(true);
  suggestions  = signal<{ _id: string; title: string; slug: string; categories?: string[] }[]>([]);
  showSuggestions = signal(false);
  activeSuggIdx   = signal(-1);

  private searchInput$   = new Subject<string>();
  private suggestInput$  = new Subject<string>();

  results = computed(() => {
    const q     = this.query().trim().toLowerCase();
    const posts = this.allPosts();
    if (!q) return posts.slice(0, 24);
    return posts.filter(p =>
      p.title?.toLowerCase().includes(q) ||
      p.description?.toLowerCase().includes(q) ||
      p.categories?.some(c => c.toLowerCase().includes(q)) ||
      p.tags?.some(t => t.toLowerCase().includes(q))
    );
  });

  hasQuery = computed(() => this.query().trim().length > 0);

  // Tracks which .adsbygoogle <ins> elements have already been pushed —
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
    this.titleSvc.setTitle('Search Stories — ApnaInsights');
    setTimeout(() => this.pushAds(), 500);
    this.meta.updateTag({ name: 'description', content: 'Search thousands of articles on ApnaInsights.' });
    // robots.txt no longer disallows /search — that previously blocked Google
    // from crawling this page at all, so it could never see this noindex tag
    // and properly drop already-indexed /search?q=... URLs from the index.
    this.meta.updateTag({ name: 'robots', content: 'noindex, follow' });

    this.route.queryParamMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(params => this.query.set(params.get('q') ?? ''));

    this.searchInput$
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe(q => {
        this.router.navigate([], {
          queryParams: { q: q || null },
          queryParamsHandling: 'merge',
          replaceUrl: true,
        });
      });

    // Autocomplete suggestions — separate stream with faster debounce
    this.suggestInput$
      .pipe(
        debounceTime(150),
        distinctUntilChanged(),
        switchMap(q => q.trim().length >= 2
          ? this.http.get<{ status: number; data: any[] }>(
              `${environment.apiUrl}/post/search/suggestions?q=${encodeURIComponent(q)}`
            ).pipe(catchError(() => of({ data: [] })))
          : of({ data: [] })
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(res => {
        this.suggestions.set(res.data ?? []);
        this.activeSuggIdx.set(-1);
        this.showSuggestions.set((res.data ?? []).length > 0);
      });

    this.loadPosts();
  }

  onInput(q: string): void {
    this.query.set(q);
    this.searchInput$.next(q);
    this.suggestInput$.next(q);
    if (!q.trim()) { this.showSuggestions.set(false); this.suggestions.set([]); }
  }

  onKeyDown(e: KeyboardEvent): void {
    const list = this.suggestions();
    if (!this.showSuggestions() || !list.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      this.activeSuggIdx.set(Math.min(this.activeSuggIdx() + 1, list.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      this.activeSuggIdx.set(Math.max(this.activeSuggIdx() - 1, -1));
    } else if (e.key === 'Enter' && this.activeSuggIdx() >= 0) {
      e.preventDefault();
      this.pickSuggestion(list[this.activeSuggIdx()]);
    } else if (e.key === 'Escape') {
      this.showSuggestions.set(false);
    }
  }

  pickSuggestion(s: { _id: string; title: string; slug: string }): void {
    this.showSuggestions.set(false);
    this.suggestions.set([]);
    this.router.navigate(['/blog', s.slug || s._id]);
  }

  hideSuggestions(): void {
    // Small delay so click on suggestion fires before blur hides the list
    setTimeout(() => this.showSuggestions.set(false), 150);
  }

  clearSearch(): void {
    this.query.set('');
    this.searchInput$.next('');
    this.suggestions.set([]);
    this.showSuggestions.set(false);
  }

  goBack(): void {
    const hasPrev = this.router.lastSuccessfulNavigation?.previousNavigation != null;
    hasPrev ? this.location.back() : this.router.navigate(['/']);
  }

  private loadPosts(): void {
    const cached = this.allPostsCache.get();
    if (cached.length) {
      this.allPosts.set(cached.filter(p => p.status === 'published'));
      this.isLoading.set(false);
      return;
    }
    this.postService.getAllPublished()
      .pipe(
        catchError(() => of([] as Post[])),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(posts => {
        const published = posts.filter(p => p.status === 'published');
        this.allPostsCache.set(published);
        this.allPosts.set(published);
        this.isLoading.set(false);
      });
  }

  readingTime(post: Post): number {
    const text = (post.content ?? '').replace(/<[^>]*>/g, '');
    return Math.max(1, Math.ceil(text.trim().split(/\s+/).length / 200));
  }

  trackById(_: number, p: Post): string { return p._id; }
}
