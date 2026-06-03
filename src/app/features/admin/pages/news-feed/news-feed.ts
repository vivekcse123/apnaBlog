import {
  ChangeDetectionStrategy, Component, OnDestroy, OnInit, inject, signal, computed
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';

import { NewsFeedService, NewsItem } from '../../../../core/services/news-feed.service';
import { PostService }               from '../../../post/services/post-service';
import { ToastService }              from '../../../../core/services/toast.service';

@Component({
  selector: 'app-news-feed',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  templateUrl: './news-feed.html',
  styleUrl:    './news-feed.css',
})
export class NewsFeed implements OnInit, OnDestroy {
  private newsSvc  = inject(NewsFeedService);
  private postSvc  = inject(PostService);
  private toast    = inject(ToastService);
  private destroy$ = new Subject<void>();

  readonly categories = this.newsSvc.CATEGORIES;

  // ── Feed state ─────────────────────────────────────────────────────────────
  selectedCat  = signal('News');
  items        = signal<NewsItem[]>([]);
  isLoading    = signal(false);
  isFirstLoad  = signal(true);
  lastUpdated  = signal<Date | null>(null);
  error        = signal('');

  // ── Publish modal state ────────────────────────────────────────────────────
  activeItem    = signal<NewsItem | null>(null);
  editTitle     = signal('');
  editSummary   = signal('');           // Part 1 — In Brief (~60 words)
  keyPoints     = signal<string[]>(['', '', '']); // Part 2 — Key Points (bullets)
  editBg        = signal('');           // Part 3 — Background / Context
  editCategory  = signal('');
  isPublishing  = signal(false);
  publishedIds  = signal<Set<string>>(new Set());

  private refreshTimer: ReturnType<typeof setInterval> | null = null;

  // ── Computed word counts ───────────────────────────────────────────────────
  briefWordCount   = computed(() => this.newsSvc.wordCount(this.editSummary()));
  bgWordCount      = computed(() => this.newsSvc.wordCount(this.editBg()));
  filledPointCount = computed(() => this.keyPoints().filter(p => p.trim()).length);
  totalWordCount   = computed(() => {
    const kpWords = this.keyPoints()
      .filter(p => p.trim())
      .reduce((s, p) => s + this.newsSvc.wordCount(p), 0);
    return this.briefWordCount() + kpWords + this.bgWordCount();
  });

  readonly POST_CATEGORIES = [
    'News','Sports','Technology','Business','Entertainment',
    'Health','Science','Lifestyle','Education','Social',
  ];

  readonly skeletonRows = Array(6).fill(null);

  ngOnInit(): void { this.load(); this.startAutoRefresh(); }
  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    if (this.refreshTimer) clearInterval(this.refreshTimer);
  }

  // ── Data ───────────────────────────────────────────────────────────────────

  selectCategory(cat: string): void {
    if (cat === this.selectedCat()) return;
    this.selectedCat.set(cat);
    this.load();
  }

  load(): void {
    this.isLoading.set(true);
    this.error.set('');
    this.newsSvc.fetchByCategory(this.selectedCat())
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: items => {
          this.items.set(items);
          this.lastUpdated.set(new Date());
          this.isLoading.set(false);
          this.isFirstLoad.set(false);
        },
        error: err => {
          const status = err?.status;
          if (status === 401 || status === 403) {
            this.error.set('Access denied. Make sure you are logged in as admin.');
          } else if (status === 0) {
            this.error.set('Cannot reach the server. Make sure the backend is running on localhost:3000.');
          } else {
            this.error.set(err?.error?.message ?? 'Failed to load news. Please try again.');
          }
          this.isLoading.set(false);
          this.isFirstLoad.set(false);
        },
      });
  }

  private startAutoRefresh(): void {
    this.refreshTimer = setInterval(() => this.load(), 5 * 60 * 1000);
  }

  // ── Publish modal ──────────────────────────────────────────────────────────

  openPublish(item: NewsItem): void {
    this.activeItem.set(item);
    this.editTitle.set(item.title);
    this.editSummary.set('');
    this.keyPoints.set(['', '', '']);
    this.editBg.set('');
    this.editCategory.set(item.category === 'All' ? 'News' : item.category);
  }

  closePublish(): void {
    this.activeItem.set(null);
    this.editTitle.set('');
    this.editSummary.set('');
    this.keyPoints.set(['', '', '']);
    this.editBg.set('');
    this.isPublishing.set(false);
  }

  // ── Key point helpers ──────────────────────────────────────────────────────

  updateKeyPoint(idx: number, value: string): void {
    this.keyPoints.update(pts => pts.map((p, i) => i === idx ? value : p));
  }

  addKeyPoint(): void {
    if (this.keyPoints().length < 5) this.keyPoints.update(pts => [...pts, '']);
  }

  removeKeyPoint(idx: number): void {
    if (this.keyPoints().length > 2) this.keyPoints.update(pts => pts.filter((_, i) => i !== idx));
  }

  // ── Publish ────────────────────────────────────────────────────────────────

  canPublish(): boolean {
    return !!(
      this.activeItem() &&
      this.editTitle().trim() &&
      this.editSummary().trim() &&
      this.keyPoints().filter(p => p.trim()).length >= 2 &&
      this.editBg().trim()
    );
  }

  publish(status: 'published' | 'draft'): void {
    const item    = this.activeItem();
    const title   = this.editTitle().trim();
    const summary = this.editSummary().trim();
    const bg      = this.editBg().trim();
    const points  = this.keyPoints().filter(p => p.trim());
    if (!item || !title || !summary || !bg || points.length < 2) return;

    this.isPublishing.set(true);

    // ── Build structured 300+ word HTML content ────────────────────────────
    const keyPointsHtml = points
      .map(p => `<li>${p.trim()}</li>`)
      .join('\n');

    const content = `
<p class="news-brief"><strong>In Brief:</strong> ${summary}</p>

<h3>Key Points</h3>
<ul>
${keyPointsHtml}
</ul>

<h3>Background</h3>
<p>${bg}</p>

<p style="margin-top:2em;padding-top:1em;border-top:1px solid #e5e7eb;">
  <a href="${item.link}" target="_blank" rel="noopener noreferrer nofollow"
     style="display:inline-flex;align-items:center;gap:6px;padding:8px 18px;border-radius:8px;background:linear-gradient(135deg,#43cea2,#185a9d);color:#fff;font-size:13.5px;font-weight:600;text-decoration:none;">
    Read Full Article ↗
  </a>
</p>
    `.trim();

    // meta description must be ≤155 chars — truncate at word boundary
    const metaDesc = summary.length <= 155
      ? summary
      : summary.substring(0, 152).replace(/\s+\S*$/, '') + '…';

    const payload: any = {
      title,
      description:   metaDesc,
      content,
      categories:    [this.editCategory()],
      tags:          ['News', 'Trending'],
      featuredImage: item.thumbnail || '',
      status,
    };

    this.postSvc.createBlog(payload)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: res => {
          const createdPostId = res?.data?._id;
          if (item._id) this.newsSvc.markPublished(item._id, createdPostId).subscribe();
          this.publishedIds.update(s => new Set([...s, item.guid]));
          this.toast.show(
            status === 'published' ? '✅ Published successfully!' : '📝 Saved as draft.',
            'success'
          );
          this.closePublish();
        },
        error: err => {
          this.toast.show(err?.error?.message ?? 'Failed to publish.', 'error');
          this.isPublishing.set(false);
        },
      });
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  timeAgo(date: string): string { return this.newsSvc.timeAgo(date); }
  isPublished(guid: string): boolean { return this.publishedIds().has(guid); }
  openOriginal(url: string): void { window.open(url, '_blank', 'noopener'); }
}
