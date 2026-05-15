import { Component, inject, signal, computed, OnInit, DestroyRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { debounceTime, distinctUntilChanged, Subject } from 'rxjs';
import { ShortsService } from '../../../shorts/services/shorts.service';
import { VideoShort } from '../../../shorts/models/video-short.model';
import { ToastService } from '../../../../core/services/toast.service';

@Component({
  selector: 'app-manage-shorts',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './manage-shorts.html',
  styleUrl:    './manage-shorts.css',
})
export class ManageShorts implements OnInit {
  private service    = inject(ShortsService);
  private toast      = inject(ToastService);
  private destroyRef = inject(DestroyRef);

  shorts      = signal<VideoShort[]>([]);
  isLoading   = signal(true);
  totalCount  = signal(0);
  currentPage = signal(1);
  totalPages  = signal(1);
  readonly LIMIT = 20;

  searchQuery      = '';
  selectedCategory = signal('');
  selectedStatus   = signal('');
  selectedType     = signal('');

  // delete confirm
  pendingDeleteId = signal<string | null>(null);
  isDeleting      = signal(false);

  // status toggle
  togglingId = signal<string | null>(null);

  private search$ = new Subject<string>();

  readonly categories = [
    'News','Sports','Technology','Entertainment',
    'Lifestyle','Health','Business','Education',
  ];

  totalShorts    = computed(() => this.totalCount());
  publishedCount = computed(() => this.shorts().filter(s => s.status === 'published').length);
  youtubeCount   = computed(() => this.shorts().filter(s => s.videoType === 'youtube').length);
  uploadCount    = computed(() => this.shorts().filter(s => s.videoType === 'upload').length);

  ngOnInit(): void {
    this.search$.pipe(
      debounceTime(350),
      distinctUntilChanged(),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(() => this.load(1));

    this.load(1);
  }

  load(page = this.currentPage()): void {
    this.isLoading.set(true);
    this.service.getAllShortsAdmin({
      page,
      limit:    this.LIMIT,
      search:   this.searchQuery.trim() || undefined,
      category: this.selectedCategory() || undefined,
      status:   this.selectedStatus()   || undefined,
      type:     this.selectedType()     || undefined,
    }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(res => {
      this.shorts.set(res.data ?? []);
      this.totalCount.set(res.total ?? 0);
      this.currentPage.set(res.page ?? page);
      this.totalPages.set(res.totalPages ?? 1);
      this.isLoading.set(false);
    });
  }

  onSearch(val: string): void { this.searchQuery = val; this.search$.next(val); }
  onFilter(): void { this.load(1); }
  prevPage(): void { if (this.currentPage() > 1) this.load(this.currentPage() - 1); }
  nextPage(): void { if (this.currentPage() < this.totalPages()) this.load(this.currentPage() + 1); }

  // ── Delete ────────────────────────────────────────────────────────────────

  confirmDelete(id: string): void { this.pendingDeleteId.set(id); }
  cancelDelete():  void { this.pendingDeleteId.set(null); }

  proceedDelete(): void {
    const id = this.pendingDeleteId();
    if (!id) return;
    this.isDeleting.set(true);
    this.service.deleteShort(id).subscribe({
      next: () => {
        this.shorts.update(list => list.filter(s => s._id !== id));
        this.totalCount.update(n => n - 1);
        this.pendingDeleteId.set(null);
        this.isDeleting.set(false);
        this.toast.show('Short deleted.', 'success');
      },
      error: err => {
        this.isDeleting.set(false);
        this.toast.show(err?.error?.message ?? 'Delete failed.', 'error');
      },
    });
  }

  // ── Status toggle ─────────────────────────────────────────────────────────

  toggleStatus(short: VideoShort): void {
    const next = short.status === 'published' ? 'pending' : 'published';
    this.togglingId.set(short._id);
    this.service.updateStatus(short._id, next).subscribe({
      next: res => {
        this.shorts.update(list =>
          list.map(s => s._id === short._id ? { ...s, status: res.data.status } : s)
        );
        this.togglingId.set(null);
        this.toast.show(`Short marked as ${next}.`, 'success');
      },
      error: err => {
        this.togglingId.set(null);
        this.toast.show(err?.error?.message ?? 'Status update failed.', 'error');
      },
    });
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  thumbnail(s: VideoShort): string {
    if (s.thumbnailUrl) return s.thumbnailUrl;
    if (s.videoType === 'youtube' && s.youtubeId)
      return `https://img.youtube.com/vi/${s.youtubeId}/hqdefault.jpg`;
    return '';
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

  trackById(_: number, s: VideoShort): string { return s._id; }
}
