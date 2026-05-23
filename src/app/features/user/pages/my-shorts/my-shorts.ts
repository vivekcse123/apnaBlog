import {
  ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ShortsService } from '../../../shorts/services/shorts.service';
import { ShortsUpload } from '../../../shorts/pages/shorts-upload/shorts-upload';
import { VideoShort } from '../../../shorts/models/video-short.model';
import { ToastService } from '../../../../core/services/toast.service';

@Component({
  selector: 'app-my-shorts',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterLink, ShortsUpload],
  templateUrl: './my-shorts.html',
  styleUrl: './my-shorts.css',
})
export class MyShorts implements OnInit {
  private service    = inject(ShortsService);
  private toast      = inject(ToastService);
  private destroyRef = inject(DestroyRef);

  shorts      = signal<VideoShort[]>([]);
  isLoading   = signal(true);
  totalCount  = signal(0);
  currentPage = signal(1);
  totalPages  = signal(1);
  readonly LIMIT = 20;

  activeFilter   = signal<'all' | 'published' | 'pending'>('all');
  showUpload     = signal(false);
  deletingId     = signal<string | null>(null);
  confirmId      = signal<string | null>(null);
  publishedCount = signal(0);
  pendingCount   = signal(0);

  ngOnInit(): void { this.load(1); }

  load(page = this.currentPage()): void {
    this.isLoading.set(true);
    const filter = this.activeFilter();
    const status = filter === 'all' ? undefined : filter;
    this.service.getMyShorts(page, this.LIMIT, status)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(res => {
        this.shorts.set(res.data ?? []);
        this.totalCount.set(res.total ?? 0);
        this.currentPage.set(res.page ?? page);
        this.totalPages.set(res.totalPages ?? 1);
        // Always update true per-status totals from API so stat cards stay accurate.
        if (res.publishedCount !== undefined) this.publishedCount.set(res.publishedCount);
        if (res.pendingCount   !== undefined) this.pendingCount.set(res.pendingCount);
        this.isLoading.set(false);
      });
  }

  setFilter(f: 'all' | 'published' | 'pending'): void {
    if (this.activeFilter() === f) return;
    this.activeFilter.set(f);
    this.load(1);
  }

  confirmDelete(id: string): void { this.confirmId.set(id); }
  cancelDelete():  void { this.confirmId.set(null); }

  proceedDelete(): void {
    const id = this.confirmId();
    if (!id || this.deletingId()) return;
    this.deletingId.set(id);
    this.service.deleteShort(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.confirmId.set(null);
          this.deletingId.set(null);
          this.toast.show('Short deleted.', 'success');
          // Reload so totalCount, publishedCount, pendingCount all stay accurate.
          this.load(this.currentPage());
        },
        error: err => {
          this.deletingId.set(null);
          this.toast.show(err?.error?.message ?? 'Delete failed.', 'error');
        },
      });
  }

  onUploadClose(): void {
    this.showUpload.set(false);
    // Always reload — handles both the non-admin "review → Done" path
    // (where `created` is never emitted) and the admin direct-publish path.
    this.load(1);
  }

  onShortCreated(_short: VideoShort): void {
    this.showUpload.set(false);
    this.toast.show('Short published.', 'success');
    this.load(1);
  }

  formatCount(n: number): string {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
    if (n >= 1_000)     return (n / 1_000).toFixed(1) + 'k';
    return String(n);
  }

  timeAgo(date: Date): string {
    const s = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
    if (s < 60)    return 'just now';
    if (s < 3600)  return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    return `${Math.floor(s / 86400)}d ago`;
  }

  prevPage(): void { if (this.currentPage() > 1) this.load(this.currentPage() - 1); }
  nextPage(): void { if (this.currentPage() < this.totalPages()) this.load(this.currentPage() + 1); }

  trackById(_: number, s: VideoShort): string { return s._id; }
}
