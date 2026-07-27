import {
  AfterViewInit, ChangeDetectionStrategy, Component, DestroyRef, ElementRef, OnDestroy, OnInit,
  PLATFORM_ID, QueryList, ViewChildren, inject, signal
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { NewsFeedService, NewsItem } from '../../core/services/news-feed.service';
import { ToastService } from '../../core/services/toast.service';
import { ViewportService } from '../../core/services/viewport.service';
import { DecodeEntitiesPipe, decodeHtmlEntities } from '../pipes/decode-entities-pipe';
import { isSafeExternalUrl } from '../utils/safe-url';

const NEWS_CATEGORY = 'News';
const REFRESH_MS     = 3 * 60 * 1000;
const LIVE_WINDOW_MS = 60 * 60 * 1000;
const PAGE_LIMIT     = 30; // must match NewsFeedService.fetchByCategory's fixed `limit` param
const LIKES_LS_KEY     = 'apna_live_news_likes';
const BOOKMARKS_LS_KEY = 'apna_live_news_bookmarks';

@Component({
  selector: 'app-live-news-section',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, DecodeEntitiesPipe],
  templateUrl: './live-news-section.html',
  styleUrl: './live-news-section.css',
})
export class LiveNewsSection implements OnInit, AfterViewInit, OnDestroy {
  private newsSvc    = inject(NewsFeedService);
  private destroyRef = inject(DestroyRef);
  private platformId = inject(PLATFORM_ID);
  private toast      = inject(ToastService);
  private viewport   = inject(ViewportService);

  items         = signal<NewsItem[]>([]);
  isLoading     = signal(true);
  isLoadingMore = signal(false);
  error         = signal('');
  hasMore       = signal(true);
  lastUpdated   = signal<Date | null>(null);
  // Scraped thumbnails are frequently hotlink-protected or 404 - track load
  // failures so the template can swap to the initial-letter fallback instead
  // of leaving the browser's broken-image alt text overlapping the card.
  private failedThumbnails = signal<Set<string>>(new Set());

  // ── Mobile "story mode" (Inshorts/breaking-news-style full screen cards) ──
  isMobile = this.viewport.isMobile;
  activeStoryIndex  = signal(0);
  private loadedThumbnails = signal<Set<string>>(new Set());
  private likedGuids       = signal<Set<string>>(this.readLocalSet(LIKES_LS_KEY));
  private bookmarkedGuids  = signal<Set<string>>(this.readLocalSet(BOOKMARKS_LS_KEY));

  @ViewChildren('storySlide') private storySlides!: QueryList<ElementRef<HTMLElement>>;
  private storyObserver: IntersectionObserver | null = null;

  // Story slides need to fill the exact space between the sticky site
  // header and the fixed mobile bottom nav. Both live in *other* components
  // (site-header / mobile-bottom-nav render as siblings on the page), so
  // rather than hardcode their heights here (fragile - already caused
  // action buttons to render clipped behind the bottom nav once), measure
  // the real rendered elements and keep it live via ResizeObserver.
  storiesMaxHeight = signal('calc(100dvh - 130px)');
  private chromeResizeObserver: ResizeObserver | null = null;
  private readonly onWindowResize = () => this.measureChromeHeight();

  private pagesLoaded = 1;
  private refreshTimer: ReturnType<typeof setInterval> | null = null;

  ngOnInit(): void {
    this.fetchPages(1, { initial: true });
    this.refreshTimer = setInterval(() => this.fetchPages(this.pagesLoaded, {}), REFRESH_MS);
  }

  ngAfterViewInit(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    this.storySlides.changes
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.setupStoryObserver());
    this.setupStoryObserver();

    this.measureChromeHeight();
    window.addEventListener('resize', this.onWindowResize);
    if (typeof ResizeObserver !== 'undefined') {
      this.chromeResizeObserver = new ResizeObserver(() => this.measureChromeHeight());
      const header = document.querySelector('.sh-header');
      const bottomNav = document.querySelector('.mob-nav');
      if (header)    this.chromeResizeObserver.observe(header);
      if (bottomNav) this.chromeResizeObserver.observe(bottomNav);
    }
  }

  ngOnDestroy(): void {
    if (this.refreshTimer) clearInterval(this.refreshTimer);
    this.storyObserver?.disconnect();
    if (isPlatformBrowser(this.platformId)) window.removeEventListener('resize', this.onWindowResize);
    this.chromeResizeObserver?.disconnect();
  }

  private measureChromeHeight(): void {
    const headerH    = document.querySelector('.sh-header')?.getBoundingClientRect().height ?? 0;
    const bottomNavH = document.querySelector('.mob-nav')?.getBoundingClientRect().height ?? 0;
    this.storiesMaxHeight.set(`calc(100dvh - ${Math.ceil(headerH)}px - ${Math.ceil(bottomNavH)}px)`);
  }

  private setupStoryObserver(): void {
    this.storyObserver?.disconnect();
    if (!this.storySlides?.length) return;

    this.storyObserver = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const idx = Number((entry.target as HTMLElement).dataset['index']);
          if (!Number.isNaN(idx)) this.activeStoryIndex.set(idx);
        }
      },
      { threshold: 0.6 }
    );
    this.storySlides.forEach(ref => this.storyObserver!.observe(ref.nativeElement));
  }

  loadMore(): void {
    if (this.isLoadingMore() || !this.hasMore()) return;
    this.fetchPages(this.pagesLoaded + 1, { loadMore: true });
  }

  retry(): void {
    this.fetchPages(this.pagesLoaded, { initial: this.items().length === 0 });
  }

  // Re-fetches pages 1..pages fresh each time (rather than merging deltas) so
  // that admin edits/removals are reflected correctly - the feed is small
  // enough (30 items/page) that this is cheap, and it avoids stale entries
  // that would otherwise never disappear once merged client-side.
  private fetchPages(pages: number, opts: { initial?: boolean; loadMore?: boolean }): void {
    if (opts.initial)  this.isLoading.set(true);
    if (opts.loadMore) this.isLoadingMore.set(true);
    this.error.set('');

    const requests = Array.from({ length: pages }, (_, i) => this.newsSvc.fetchPublicByCategory(NEWS_CATEGORY, i + 1));

    forkJoin(requests)
      .pipe(
        catchError(() => of(null)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(results => {
        if (results) {
          const seen = new Set<string>();
          const merged: NewsItem[] = [];
          for (const page of results) {
            for (const item of page) {
              if (seen.has(item.guid)) continue;
              seen.add(item.guid);
              merged.push(item);
            }
          }
          this.items.set(merged);
          this.pagesLoaded = pages;
          this.hasMore.set((results[results.length - 1]?.length ?? 0) >= PAGE_LIMIT);
          this.lastUpdated.set(new Date());
        } else if (this.items().length === 0) {
          this.error.set('Unable to load live news right now.');
        }
        this.isLoading.set(false);
        this.isLoadingMore.set(false);
      });
  }

  isSafeLink(url: string): boolean { return isSafeExternalUrl(url); }

  hasThumbnail(item: NewsItem): boolean {
    return !!item.thumbnail && !this.failedThumbnails().has(item.guid);
  }

  onThumbnailError(guid: string): void {
    this.failedThumbnails.update(s => new Set(s).add(guid));
  }

  isLive(item: NewsItem): boolean {
    return Date.now() - new Date(item.pubDate).getTime() < LIVE_WINDOW_MS;
  }

  timeAgo(dateStr: string): string { return this.newsSvc.timeAgo(dateStr); }

  sourceInitial(item: NewsItem): string {
    return (item.sourceName || item.title || '?').charAt(0).toUpperCase();
  }

  // Scraped feeds frequently omit a description - story mode always needs a
  // brief line under the headline. We have no article body to summarise
  // from client-side, so rather than fabricate a fake summary or repeat a
  // generic "tap to read" CTA on every card, fall back to a short factual
  // caption built only from fields we actually have (category + source).
  storyBrief(item: NewsItem): string {
    const desc = decodeHtmlEntities(item.description).trim();
    if (desc) return desc;
    const cat = item.category?.trim();
    const source = item.sourceName?.trim();
    if (cat && source) return `${cat} coverage from ${source}.`;
    if (source) return `Reported by ${source}.`;
    if (cat) return `${cat} coverage.`;
    return 'Live update - read the full story for details.';
  }

  // ── Story-mode interactions ──────────────────────────────────────────────

  onThumbnailLoad(guid: string): void {
    this.loadedThumbnails.update(s => new Set(s).add(guid));
  }
  isThumbnailLoaded(guid: string): boolean {
    return this.loadedThumbnails().has(guid);
  }

  isBookmarked(guid: string): boolean { return this.bookmarkedGuids().has(guid); }
  toggleBookmark(guid: string, event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    const next = new Set(this.bookmarkedGuids());
    next.has(guid) ? next.delete(guid) : next.add(guid);
    this.bookmarkedGuids.set(next);
    this.writeLocalSet(BOOKMARKS_LS_KEY, next);
  }

  isLiked(guid: string): boolean { return this.likedGuids().has(guid); }
  toggleLike(guid: string, event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    const next = new Set(this.likedGuids());
    next.has(guid) ? next.delete(guid) : next.add(guid);
    this.likedGuids.set(next);
    this.writeLocalSet(LIKES_LS_KEY, next);
  }

  async share(item: NewsItem, event: Event): Promise<void> {
    event.preventDefault();
    event.stopPropagation();
    if (!isPlatformBrowser(this.platformId)) return;

    const nav = navigator as Navigator & { share?: (data: ShareData) => Promise<void> };
    if (nav.share) {
      try { await nav.share({ title: item.title, text: item.description, url: item.link }); }
      catch { /* user dismissed the native share sheet */ }
      return;
    }
    try {
      await navigator.clipboard.writeText(item.link);
      this.toast.show('Link copied to clipboard', 'success');
    } catch {
      this.toast.show('Unable to share this story right now', 'error');
    }
  }

  private readLocalSet(key: string): Set<string> {
    if (!isPlatformBrowser(this.platformId)) return new Set();
    try {
      const s = localStorage.getItem(key);
      return s ? new Set(JSON.parse(s)) : new Set();
    } catch { return new Set(); }
  }

  private writeLocalSet(key: string, ids: Set<string>): void {
    if (!isPlatformBrowser(this.platformId)) return;
    try { localStorage.setItem(key, JSON.stringify([...ids])); } catch { /* quota */ }
  }
}
