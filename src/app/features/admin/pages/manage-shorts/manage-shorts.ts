import {
  ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { debounceTime, distinctUntilChanged, forkJoin, Subject } from 'rxjs';
import { ShortsService } from '../../../shorts/services/shorts.service';
import { VideoShort } from '../../../shorts/models/video-short.model';
import { ToastService } from '../../../../core/services/toast.service';

@Component({
  selector: 'app-manage-shorts',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './manage-shorts.html',
  styleUrl:    './manage-shorts.css',
})
export class ManageShorts implements OnInit {
  private service    = inject(ShortsService);
  private toast      = inject(ToastService);
  private destroyRef = inject(DestroyRef);

  // ── Table state ────────────────────────────────────────────────────────────
  shorts      = signal<VideoShort[]>([]);
  isLoading   = signal(true);
  totalCount  = signal(0);   // filtered count — used for pagination display only
  currentPage = signal(1);
  totalPages  = signal(1);
  readonly LIMIT = 10;

  searchQuery      = '';
  selectedCategory = signal('');
  selectedStatus   = signal('');
  filterSponsored  = signal(false);

  // ── Global stats — reflect actual DB counts regardless of table filters ────
  // Loaded fresh on init and after every mutation (create / edit / delete / status).
  globalTotal   = signal(0);   // all shorts in DB
  globalLive    = signal(0);   // published shorts
  globalPending = signal(0);   // pending shorts
  globalSponsored = signal(0); // sponsored shorts
  statsLoading  = signal(false);

  // ── Delete ─────────────────────────────────────────────────────────────────
  pendingDeleteId = signal<string | null>(null);
  isDeleting      = signal(false);

  // ── Status toggle ──────────────────────────────────────────────────────────
  togglingId = signal<string | null>(null);

  // ── Edit modal ─────────────────────────────────────────────────────────────
  editShort          = signal<VideoShort | null>(null);
  editTitle          = '';
  editCaption        = '';
  editCategory       = '';
  editLinkedPostSlug = '';
  isSaving           = signal(false);

  private search$ = new Subject<string>();

  readonly categories = [
    'News', 'Sports', 'Technology', 'Entertainment',
    'Lifestyle', 'Health', 'Business', 'Education',
    'Finance', 'Travel', 'Food', 'Fashion',
    'Fitness', 'Gaming', 'Comedy', 'Motivation',
    'Politics', 'Science', 'Art', 'Music',
  ];

  // Pagination helpers
  pageStart   = computed(() => this.totalCount() === 0 ? 0 : (this.currentPage() - 1) * this.LIMIT + 1);
  pageEnd     = computed(() => Math.min(this.currentPage() * this.LIMIT, this.totalCount()));
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
    this.loadGlobalStats();
  }

  // ── Stats ──────────────────────────────────────────────────────────────────
  // Four parallel limit:1 requests — each returns only the `total` field we need.
  // Refreshed after every mutation so the stats bar is always in sync.

  loadGlobalStats(): void {
    this.statsLoading.set(true);
    forkJoin({
      all:       this.service.getAllShortsAdmin({ page: 1, limit: 1 }),
      live:      this.service.getAllShortsAdmin({ page: 1, limit: 1, status: 'published' }),
      pending:   this.service.getAllShortsAdmin({ page: 1, limit: 1, status: 'pending' }),
      sponsored: this.service.getAllShortsAdmin({ page: 1, limit: 1, isSponsored: true }),
    }).pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: res => {
          this.globalTotal.set(res.all.total       ?? 0);
          this.globalLive.set(res.live.total        ?? 0);
          this.globalPending.set(res.pending.total  ?? 0);
          this.globalSponsored.set(res.sponsored.total ?? 0);
          this.statsLoading.set(false);
        },
        error: () => this.statsLoading.set(false),
      });
  }

  // ── Table load ─────────────────────────────────────────────────────────────

  load(page = this.currentPage()): void {
    this.isLoading.set(true);
    this.service.getAllShortsAdmin({
      page,
      limit:       this.LIMIT,
      search:      this.searchQuery.trim() || undefined,
      category:    this.selectedCategory() || undefined,
      status:      this.selectedStatus()   || undefined,
      isSponsored: this.filterSponsored()  || undefined,
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
  toggleSponsored(): void { this.filterSponsored.update(v => !v); this.load(1); }

  filterByStatus(status: string): void {
    this.selectedStatus.set(status);
    this.filterSponsored.set(false);
    this.load(1);
  }

  prevPage(): void { if (this.currentPage() > 1) this.load(this.currentPage() - 1); }
  nextPage(): void { if (this.currentPage() < this.totalPages()) this.load(this.currentPage() + 1); }
  goToPage(p: number | '...'): void { if (typeof p === 'number') this.load(p); }

  // ── Delete ─────────────────────────────────────────────────────────────────

  confirmDelete(id: string): void { this.pendingDeleteId.set(id); }
  cancelDelete():  void { this.pendingDeleteId.set(null); }

  proceedDelete(): void {
    const id = this.pendingDeleteId();
    if (!id) return;
    this.isDeleting.set(true);
    this.service.deleteShort(id).subscribe({
      next: () => {
        this.shorts.update(list => list.filter(s => s._id !== id));
        this.totalCount.update(n => Math.max(0, n - 1));
        this.pendingDeleteId.set(null);
        this.isDeleting.set(false);
        this.toast.show('Short deleted.', 'success');
        this.loadGlobalStats();
      },
      error: err => {
        this.isDeleting.set(false);
        this.toast.show(err?.error?.message ?? 'Delete failed.', 'error');
      },
    });
  }

  // ── Edit ───────────────────────────────────────────────────────────────────

  openEdit(s: VideoShort): void {
    this.editShort.set(s);
    this.editTitle          = s.title;
    this.editCaption        = s.caption ?? '';
    this.editCategory       = s.category;
    this.editLinkedPostSlug = s.linkedPostSlug ?? '';
  }

  closeEdit(): void { this.editShort.set(null); }

  saveEdit(): void {
    const s = this.editShort();
    if (!s || this.isSaving()) return;
    if (!this.editTitle.trim()) { this.toast.show('Title is required.', 'error'); return; }
    this.isSaving.set(true);
    this.service.updateShort(s._id, {
      title:          this.editTitle.trim(),
      caption:        this.editCaption.trim() || undefined,
      category:       this.editCategory,
      linkedPostSlug: this.editLinkedPostSlug.trim() || undefined,
    }).subscribe({
      next: res => {
        this.shorts.update(list => list.map(x => x._id === s._id ? { ...x, ...res.data } : x));
        this.isSaving.set(false);
        this.editShort.set(null);
        this.toast.show('Short updated.', 'success');
        // Edit doesn't change counts, no stats refresh needed
      },
      error: err => {
        this.isSaving.set(false);
        this.toast.show(err?.error?.message ?? 'Update failed.', 'error');
      },
    });
  }

  // ── Status toggle ──────────────────────────────────────────────────────────

  toggleStatus(short: VideoShort): void {
    const next = short.status === 'published' ? 'pending' : 'published';
    this.togglingId.set(short._id);
    this.service.updateStatus(short._id, next).subscribe({
      next: res => {
        this.shorts.update(list => list.map(s => s._id === short._id ? { ...s, status: res.data.status } : s));
        this.togglingId.set(null);
        this.toast.show(`Short is now ${next === 'published' ? 'live' : 'pending'}.`, 'success');
        this.loadGlobalStats();
      },
      error: err => {
        this.togglingId.set(null);
        this.toast.show(err?.error?.message ?? 'Status update failed.', 'error');
      },
    });
  }

  // ── Preview modal ──────────────────────────────────────────────────────────

  previewShort = signal<VideoShort | null>(null);

  openPreview(s: VideoShort): void  { this.previewShort.set(s); }
  closePreview(): void              { this.previewShort.set(null); }

  approveFromPreview(): void {
    const s = this.previewShort();
    if (!s) return;
    this.closePreview();
    this.toggleStatus(s);
  }

  rejectFromPreview(): void {
    const s = this.previewShort();
    if (!s) return;
    this.closePreview();
    this.confirmDelete(s._id);
  }

  // ── Sponsor modal ──────────────────────────────────────────────────────────

  showSponsorModal    = signal(false);
  sponsorTargetId     = signal('');
  sponsorTargetTitle  = signal('');
  sponsorHasExpiry    = signal(false);
  sponsorDays         = signal(30);
  sponsorExpiryAction = signal<'delete' | 'keep'>('keep');
  sponsorPriority     = signal(1);
  sponsorCtaText      = signal('');
  sponsorCtaUrl       = signal('');
  isSponsorSaving     = signal(false);

  openSponsorModal(s: VideoShort): void {
    this.sponsorTargetId.set(s._id);
    this.sponsorTargetTitle.set(s.title);
    this.sponsorHasExpiry.set(false);
    this.sponsorDays.set(30);
    this.sponsorExpiryAction.set('keep');
    this.sponsorPriority.set(s.sponsorPriority ?? 1);
    this.sponsorCtaText.set(s.sponsorCtaText ?? '');
    this.sponsorCtaUrl.set(s.sponsorCtaUrl ?? '');
    this.showSponsorModal.set(true);
  }

  closeSponsorModal(): void {
    this.showSponsorModal.set(false);
    this.sponsorTargetId.set('');
    this.sponsorTargetTitle.set('');
  }

  submitSponsor(): void {
    const id = this.sponsorTargetId();
    if (!id || this.isSponsorSaving()) return;
    this.isSponsorSaving.set(true);
    const days         = this.sponsorHasExpiry() ? this.sponsorDays() : undefined;
    const expiryAction = this.sponsorHasExpiry() ? this.sponsorExpiryAction() : undefined;
    const priority     = this.sponsorPriority();
    const ctaText      = this.sponsorCtaText().trim() || undefined;
    const ctaUrl       = this.sponsorCtaUrl().trim()  || undefined;
    this.service.sponsorShort(id, days, expiryAction, priority, ctaText, ctaUrl)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: res => {
          this.shorts.update(list => list.map(s => s._id === id ? { ...s, ...res.data } : s));
          this.isSponsorSaving.set(false);
          this.closeSponsorModal();
          this.toast.show('Short marked as sponsored.', 'success');
          this.loadGlobalStats();
        },
        error: err => {
          this.isSponsorSaving.set(false);
          this.toast.show(err?.error?.message ?? 'Failed to sponsor short.', 'error');
        },
      });
  }

  unsponsorVideo(s: VideoShort): void {
    this.service.unsponsorShort(s._id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: res => {
          this.shorts.update(list => list.map(x => x._id === s._id ? { ...x, ...res.data } : x));
          this.toast.show('Sponsorship removed.', 'success');
          this.loadGlobalStats();
        },
        error: err => this.toast.show(err?.error?.message ?? 'Failed to remove sponsorship.', 'error'),
      });
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

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
