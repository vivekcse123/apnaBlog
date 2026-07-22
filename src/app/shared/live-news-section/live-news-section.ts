import {
  ChangeDetectionStrategy, Component, DestroyRef, OnDestroy, OnInit, inject, signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { NewsFeedService, NewsItem } from '../../core/services/news-feed.service';
import { isSafeExternalUrl } from '../utils/safe-url';

const NEWS_CATEGORY = 'News';
const REFRESH_MS     = 3 * 60 * 1000;
const LIVE_WINDOW_MS = 60 * 60 * 1000;
const PAGE_LIMIT     = 30; // must match NewsFeedService.fetchByCategory's fixed `limit` param

@Component({
  selector: 'app-live-news-section',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  templateUrl: './live-news-section.html',
  styleUrl: './live-news-section.css',
})
export class LiveNewsSection implements OnInit, OnDestroy {
  private newsSvc    = inject(NewsFeedService);
  private destroyRef = inject(DestroyRef);

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

  private pagesLoaded = 1;
  private refreshTimer: ReturnType<typeof setInterval> | null = null;

  ngOnInit(): void {
    this.fetchPages(1, { initial: true });
    this.refreshTimer = setInterval(() => this.fetchPages(this.pagesLoaded, {}), REFRESH_MS);
  }

  ngOnDestroy(): void {
    if (this.refreshTimer) clearInterval(this.refreshTimer);
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
}
