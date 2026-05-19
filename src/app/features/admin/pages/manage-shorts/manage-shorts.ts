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
  filterToday      = signal(false);

  // Delete
  pendingDeleteId = signal<string | null>(null);
  isDeleting      = signal(false);

  // Status toggle
  togglingId = signal<string | null>(null);

  // Edit modal
  editShort    = signal<VideoShort | null>(null);
  editTitle    = '';
  editCaption  = '';
  editCategory = '';
  isSaving     = signal(false);

  private search$ = new Subject<string>();

  readonly categories = [
    'News','Sports','Technology','Entertainment',
    'Lifestyle','Health','Business','Education',
  ];

  totalShorts    = computed(() => this.totalCount());
  pageStart      = computed(() => (this.currentPage() - 1) * this.LIMIT + 1);
  pageEnd        = computed(() => Math.min(this.currentPage() * this.LIMIT, this.totalCount()));
  publishedCount = computed(() => this.shorts().filter(s => s.status === 'published').length);
  pendingCount   = computed(() => this.shorts().filter(s => s.status === 'pending').length);
  todayCount     = computed(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return this.shorts().filter(s => new Date(s.createdAt) >= today).length;
  });

  pageNumbers = computed(() => {
    const total = this.totalPages(), current = this.currentPage();
    const pages: (number | '...')[] = [];
    if (total <= 7) { for (let i = 1; i <= total; i++) pages.push(i); }
    else {
      pages.push(1);
      if (current > 3) pages.push('...');
      for (let i = Math.max(2, current - 1); i <= Math.min(total - 1, current + 1); i++) pages.push(i);
      if (current < total - 2) pages.push('...');
      pages.push(total);
    }
    return pages;
  });

  ngOnInit(): void {
    this.search$.pipe(debounceTime(350), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.load(1));
    this.load(1);
  }

  load(page = this.currentPage()): void {
    this.isLoading.set(true);
    const today = this.filterToday() ? new Date().toISOString().slice(0, 10) : undefined;
    this.service.getAllShortsAdmin({
      page,
      limit:    this.LIMIT,
      search:   this.searchQuery.trim() || undefined,
      category: this.selectedCategory() || undefined,
      status:   this.selectedStatus()   || undefined,
      ...(today ? { search: (this.searchQuery.trim() || '') } : {}),
    }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(res => {
      let data = res.data ?? [];
      if (this.filterToday()) {
        const start = new Date(); start.setHours(0, 0, 0, 0);
        data = data.filter(s => new Date(s.createdAt) >= start);
      }
      this.shorts.set(data);
      this.totalCount.set(this.filterToday() ? data.length : (res.total ?? 0));
      this.currentPage.set(res.page ?? page);
      this.totalPages.set(this.filterToday() ? 1 : (res.totalPages ?? 1));
      this.isLoading.set(false);
    });
  }

  onSearch(val: string): void { this.searchQuery = val; this.search$.next(val); }
  onFilter(): void { this.load(1); }
  toggleToday(): void { this.filterToday.update(v => !v); this.load(1); }

  prevPage(): void { if (this.currentPage() > 1) this.load(this.currentPage() - 1); }
  nextPage(): void { if (this.currentPage() < this.totalPages()) this.load(this.currentPage() + 1); }
  goToPage(p: number | '...'): void { if (typeof p === 'number') this.load(p); }

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
      error: err => { this.isDeleting.set(false); this.toast.show(err?.error?.message ?? 'Delete failed.', 'error'); },
    });
  }

  // ── Edit ──────────────────────────────────────────────────────────────────

  openEdit(s: VideoShort): void {
    this.editShort.set(s);
    this.editTitle    = s.title;
    this.editCaption  = s.caption ?? '';
    this.editCategory = s.category;
  }

  closeEdit(): void { this.editShort.set(null); }

  saveEdit(): void {
    const s = this.editShort();
    if (!s || this.isSaving()) return;
    if (!this.editTitle.trim()) { this.toast.show('Title is required.', 'error'); return; }
    this.isSaving.set(true);

    // Reuse createShort payload shape — backend route is PATCH /:id
    this.service.updateShort(s._id, {
      title:    this.editTitle.trim(),
      caption:  this.editCaption.trim() || undefined,
      category: this.editCategory,
    }).subscribe({
      next: res => {
        this.shorts.update(list => list.map(x => x._id === s._id ? { ...x, ...res.data } : x));
        this.isSaving.set(false);
        this.editShort.set(null);
        this.toast.show('Short updated.', 'success');
      },
      error: err => {
        this.isSaving.set(false);
        this.toast.show(err?.error?.message ?? 'Update failed.', 'error');
      },
    });
  }

  // ── Status toggle ─────────────────────────────────────────────────────────

  toggleStatus(short: VideoShort): void {
    const next = short.status === 'published' ? 'pending' : 'published';
    this.togglingId.set(short._id);
    this.service.updateStatus(short._id, next).subscribe({
      next: res => {
        this.shorts.update(list => list.map(s => s._id === short._id ? { ...s, status: res.data.status } : s));
        this.togglingId.set(null);
        this.toast.show(`Short marked as ${next}.`, 'success');
      },
      error: err => { this.togglingId.set(null); this.toast.show(err?.error?.message ?? 'Status update failed.', 'error'); },
    });
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  thumbnail(s: VideoShort): string { return s.thumbnailUrl ?? ''; }

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
