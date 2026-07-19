import { Component, ChangeDetectionStrategy, OnInit, PLATFORM_ID, effect, inject, signal, untracked } from '@angular/core';
import { CommonModule, DatePipe, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CallbackRequestService } from '../../../career-guides/services/callback-request.service';
import { CallbackRequestRecord, CallbackStatus } from '../../../career-guides/models/callback-request.model';
import { MOCK_EXPERTS, MOCK_CATEGORIES } from '../../../career-guides/data/mock-experts';

const STATUSES: CallbackStatus[] = ['pending', 'accepted', 'rejected', 'scheduled', 'completed', 'cancelled', 'expired'];

@Component({
  selector: 'app-manage-callback-requests',
  standalone: true,
  imports: [CommonModule, FormsModule, DatePipe],
  templateUrl: './manage-callback-requests.html',
  styleUrl: './manage-callback-requests.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ManageCallbackRequests implements OnInit {
  private callbackRequests = inject(CallbackRequestService);
  private platformId = inject(PLATFORM_ID);

  readonly statuses = STATUSES;
  readonly experts = MOCK_EXPERTS;
  readonly categories = MOCK_CATEGORIES;

  requests = signal<CallbackRequestRecord[]>([]);
  total = signal(0);
  page = signal(1);
  readonly limit = 20;
  isLoading = signal(true);
  error = signal('');
  updating = signal<Set<string>>(new Set());
  expandedId = signal<string | null>(null);

  statusFilter = signal<CallbackStatus | ''>('');
  expertFilter = signal('');
  categoryFilter = signal('');
  fromFilter = signal('');
  toFilter = signal('');

  constructor() {
    effect(() => {
      this.callbackRequests.liveTick();
      if (!untracked(this.isLoading)) this.load();
    });
  }

  ngOnInit(): void {
    this.callbackRequests.ensureLive();
    this.load();
  }

  applyFilters(): void {
    this.page.set(1);
    this.load();
  }

  resetFilters(): void {
    this.statusFilter.set('');
    this.expertFilter.set('');
    this.categoryFilter.set('');
    this.fromFilter.set('');
    this.toFilter.set('');
    this.applyFilters();
  }

  load(): void {
    this.isLoading.set(true);
    this.error.set('');
    this.callbackRequests.adminList({
      status: this.statusFilter() || undefined,
      expertSlug: this.expertFilter() || undefined,
      category: this.categoryFilter() || undefined,
      from: this.fromFilter() || undefined,
      to: this.toFilter() || undefined,
      page: this.page(),
      limit: this.limit,
    }).subscribe({
      next: (res) => {
        this.requests.set(res.data ?? []);
        this.total.set(res.total ?? 0);
        this.isLoading.set(false);
      },
      error: (err) => {
        this.error.set(err?.error?.message ?? 'Failed to load callback requests.');
        this.isLoading.set(false);
      },
    });
  }

  toggleExpand(id: string): void {
    this.expandedId.set(this.expandedId() === id ? null : id);
  }

  // Accept/Reject/Schedule are the initial triage decision - only valid
  // while nothing has been decided yet. Mark Completed only makes sense
  // once accepted/scheduled and followed up with the requester. Admin can
  // cancel at any point before it's actually resolved.
  canDecide(status: CallbackStatus): boolean { return status === 'pending'; }
  canComplete(status: CallbackStatus): boolean { return status === 'accepted' || status === 'scheduled'; }
  canCancel(status: CallbackStatus): boolean { return status === 'pending' || status === 'accepted' || status === 'scheduled'; }

  updateStatus(id: string, status: CallbackStatus): void {
    const set = new Set(this.updating());
    set.add(id);
    this.updating.set(set);
    this.callbackRequests.updateStatus(id, status).subscribe({
      next: (res) => {
        this.requests.update(list => list.map(r => r._id === id ? res.data : r));
        const s = new Set(this.updating()); s.delete(id); this.updating.set(s);
      },
      error: (err) => {
        alert(err?.error?.message ?? 'Could not update this request.');
        const s = new Set(this.updating()); s.delete(id); this.updating.set(s);
      },
    });
  }

  totalPages(): number { return Math.max(1, Math.ceil(this.total() / this.limit)); }
  goToPage(p: number): void {
    if (p < 1 || p > this.totalPages()) return;
    this.page.set(p);
    this.load();
  }

  // Client-side CSV of whatever's currently loaded (i.e. the current filtered
  // page) - no backend export endpoint, just a plain Blob download.
  exportCsv(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    const cols = ['Request ID', 'User Name', 'Expert Name', 'Category', 'Topic', 'Preferred Date', 'Preferred Time', 'Status', 'Created On', 'Last Updated'];
    const rows = this.requests().map(r => [
      r._id, r.userName, r.expertName, r.category, r.topic, r.preferredDate, r.preferredTime, r.status, r.createdAt, r.updatedAt,
    ]);
    const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const csv = [cols, ...rows].map(row => row.map(v => escape(String(v))).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `callback-requests-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  trackById(_i: number, r: CallbackRequestRecord): string { return r._id; }
}
