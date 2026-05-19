import { Component, inject, signal, computed, OnInit, DestroyRef, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { debounceTime, distinctUntilChanged, Subject } from 'rxjs';
import { environment } from '../../../../../environments/environment';
import { ToastService } from '../../../../core/services/toast.service';

interface Subscriber {
  _id: string; email: string; name: string;
  status: 'active' | 'unsubscribed'; createdAt: string;
}
interface Stats {
  total: number; active: number; unsubscribed: number; thisMonth: number; today: number;
}
interface Post {
  _id: string; title: string; description: string;
  categories: string[]; featuredImage?: string; slug?: string;
  views: number; likesCount: number; createdAt: string;
  user?: { name: string };
}

@Component({
  selector: 'app-manage-subscribers',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './manage-subscribers.html',
  styleUrl:    './manage-subscribers.css',
})
export class ManageSubscribers implements OnInit {
  private http       = inject(HttpClient);
  private toast      = inject(ToastService);
  private destroyRef = inject(DestroyRef);
  private platformId = inject(PLATFORM_ID);
  private api        = `${environment.apiUrl}/subscribers`;
  private pushApi    = `${environment.apiUrl}/push`;

  subscribers  = signal<Subscriber[]>([]);
  isLoading    = signal(true);
  totalCount   = signal(0);
  currentPage  = signal(1);
  totalPages   = signal(1);
  stats        = signal<Stats | null>(null);
  readonly LIMIT = 20;

  searchQuery    = '';
  selectedStatus = '';
  pendingDeleteId = signal<string | null>(null);
  isDeleting      = signal(false);

  // Newsletter compose
  showNewsletter  = signal(false);
  nlPosts         = signal<Post[]>([]);
  nlLoadingPosts  = signal(false);
  nlSelectedIds   = signal<Set<string>>(new Set());
  nlSubject       = '';
  nlIntro         = '';
  isSending       = signal(false);

  private search$ = new Subject<string>();

  totalSubscribers = computed(() => this.totalCount());
  pageStart        = computed(() => (this.currentPage() - 1) * this.LIMIT + 1);
  pageEnd          = computed(() => Math.min(this.currentPage() * this.LIMIT, this.totalCount()));
  activeCount      = computed(() => this.stats()?.active ?? 0);
  pushCount        = signal(0);

  pageNumbers = computed(() => {
    const total = this.totalPages(), cur = this.currentPage();
    const pages: (number | '...')[] = [];
    if (total <= 7) { for (let i = 1; i <= total; i++) pages.push(i); }
    else {
      pages.push(1);
      if (cur > 3) pages.push('...');
      for (let i = Math.max(2, cur - 1); i <= Math.min(total - 1, cur + 1); i++) pages.push(i);
      if (cur < total - 2) pages.push('...');
      pages.push(total);
    }
    return pages;
  });

  ngOnInit(): void {
    this.search$.pipe(debounceTime(350), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.load(1));
    this.loadStats();
    this.loadPushCount();
    this.load(1);
  }

  loadPushCount(): void {
    this.http.get<{ status: number; data: { total: number } }>(`${this.pushApi}/stats`)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: r => this.pushCount.set(r.data?.total ?? 0), error: () => {} });
  }

  exportCSV(): void {
    if (!isPlatformBrowser(this.platformId) || !this.subscribers().length) return;
    const rows = [
      ['Email', 'Name', 'Status', 'Joined'],
      ...this.subscribers().map(s => [
        s.email,
        `"${(s.name || '').replace(/"/g, '""')}"`,
        s.status,
        new Date(s.createdAt).toLocaleDateString('en-IN'),
      ]),
    ];
    const csv  = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = `subscribers-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  loadStats(): void {
    this.http.get<{ status: number; data: Stats }>(`${this.api}/stats`)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: r => this.stats.set(r.data), error: () => {} });
  }

  load(page = this.currentPage()): void {
    this.isLoading.set(true);
    const params: Record<string, string> = { page: String(page), limit: String(this.LIMIT) };
    if (this.searchQuery.trim()) params['search'] = this.searchQuery.trim();
    if (this.selectedStatus)     params['status']  = this.selectedStatus;
    const qs = new URLSearchParams(params).toString();

    this.http.get<{ status: number; data: Subscriber[]; total: number; page: number; totalPages: number }>(
      `${this.api}?${qs}`
    ).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: res => {
        this.subscribers.set(res.data ?? []);
        this.totalCount.set(res.total ?? 0);
        this.currentPage.set(res.page ?? page);
        this.totalPages.set(res.totalPages ?? 1);
        this.isLoading.set(false);
      },
      error: () => this.isLoading.set(false),
    });
  }

  onSearch(val: string): void { this.searchQuery = val; this.search$.next(val); }
  onFilter(): void { this.load(1); }
  prevPage(): void { if (this.currentPage() > 1) this.load(this.currentPage() - 1); }
  nextPage(): void { if (this.currentPage() < this.totalPages()) this.load(this.currentPage() + 1); }
  goToPage(p: number | '...'): void { if (typeof p === 'number') this.load(p); }

  // ── Newsletter ────────────────────────────────────────────────────────────

  openNewsletter(): void {
    this.showNewsletter.set(true);
    this.nlSubject = '';
    this.nlIntro   = '';
    this.nlSelectedIds.set(new Set());
    if (!this.nlPosts().length) this.fetchPosts();
  }

  closeNewsletter(): void { this.showNewsletter.set(false); }

  fetchPosts(): void {
    this.nlLoadingPosts.set(true);
    this.http.get<{ status: number; data: Post[] }>(`${this.api}/posts`)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: r => { this.nlPosts.set(r.data ?? []); this.nlLoadingPosts.set(false); },
        error: () => this.nlLoadingPosts.set(false),
      });
  }

  togglePost(id: string): void {
    this.nlSelectedIds.update(set => {
      const next = new Set(set);
      if (next.has(id)) next.delete(id); else if (next.size < 6) next.add(id);
      return next;
    });
  }

  isSelected(id: string): boolean { return this.nlSelectedIds().has(id); }

  sendNewsletter(): void {
    if (!this.nlSubject.trim()) { this.toast.show('Subject is required.', 'error'); return; }
    if (!this.nlSelectedIds().size) { this.toast.show('Select at least one story.', 'error'); return; }
    if (this.isSending()) return;

    this.isSending.set(true);
    this.http.post<{ status: number; message: string }>(`${this.api}/send-newsletter`, {
      subject: this.nlSubject.trim(),
      intro:   this.nlIntro.trim(),
      postIds: Array.from(this.nlSelectedIds()),
    }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: res => {
        this.isSending.set(false);
        this.showNewsletter.set(false);
        this.toast.show(res.message ?? 'Newsletter sent!', 'success');
      },
      error: err => {
        this.isSending.set(false);
        this.toast.show(err?.error?.message ?? 'Failed to send newsletter.', 'error');
      },
    });
  }

  // ── Subscriber actions ────────────────────────────────────────────────────

  unsubscribe(s: Subscriber): void {
    this.http.patch<{ status: number }>(`${this.api}/${s._id}/unsubscribe`, {})
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.subscribers.update(list => list.map(x => x._id === s._id ? { ...x, status: 'unsubscribed' as const } : x));
          this.toast.show('Marked as unsubscribed.', 'success');
          this.loadStats();
        },
        error: () => this.toast.show('Failed to update.', 'error'),
      });
  }

  confirmDelete(id: string): void { this.pendingDeleteId.set(id); }
  cancelDelete():  void { this.pendingDeleteId.set(null); }

  proceedDelete(): void {
    const id = this.pendingDeleteId();
    if (!id) return;
    this.isDeleting.set(true);
    this.http.delete<{ status: number }>(`${this.api}/${id}`)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.subscribers.update(list => list.filter(s => s._id !== id));
          this.totalCount.update(n => n - 1);
          this.pendingDeleteId.set(null);
          this.isDeleting.set(false);
          this.toast.show('Subscriber removed.', 'success');
          this.loadStats();
        },
        error: () => { this.isDeleting.set(false); this.toast.show('Delete failed.', 'error'); },
      });
  }

  timeAgo(date: string): string {
    const s = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
    if (s < 60)    return 'just now';
    if (s < 3600)  return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    return `${Math.floor(s / 86400)}d ago`;
  }

  trackById(_: number, s: Subscriber): string { return s._id; }
}
