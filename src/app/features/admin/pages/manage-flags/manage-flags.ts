import { ChangeDetectionStrategy, Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Router } from '@angular/router';
import { environment } from '../../../../../environments/environment';
import { Auth } from '../../../../core/services/auth';
import { ToastService } from '../../../../core/services/toast.service';
import { ConfirmModal } from '../../../../shared/confirm-modal/confirm-modal';
import { Pagination } from '../../../../shared/components/pagination/pagination';

interface FlagEntry {
  _id:       string;
  post: {
    _id:          string;
    title:        string;
    slug:         string;
    isFlagged:    boolean;
    flagCount:    number;
    status:       string;
    user?:        { name: string } | null;
  } | null;
  user:      { _id: string; name: string; email: string } | null;
  reason:    string;
  details:   string;
  resolved:  boolean;
  createdAt: string;
}

interface GroupedFlags {
  postId:    string;
  postTitle: string;
  slug:      string;
  isFlagged: boolean;
  flagCount: number;
  author:    string;
  flags:     FlagEntry[];
  expanded:  boolean;
}

@Component({
  selector: 'app-manage-flags',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, ConfirmModal, Pagination],
  templateUrl: './manage-flags.html',
  styleUrl: './manage-flags.css',
})
export class ManageFlags implements OnInit {
  private http   = inject(HttpClient);
  private auth   = inject(Auth);
  private router = inject(Router);
  private toast  = inject(ToastService);

  flags    = signal<FlagEntry[]>([]);
  isLoading = signal(true);
  error    = signal('');
  resolving = signal<Set<string>>(new Set());
  pendingResolve = signal<GroupedFlags | null>(null);

  grouped = computed<GroupedFlags[]>(() => {
    const map = new Map<string, GroupedFlags>();
    for (const f of this.flags()) {
      if (!f.post) continue;
      const pid = f.post._id;
      if (!map.has(pid)) {
        map.set(pid, {
          postId: pid,
          postTitle: f.post.title,
          slug: f.post.slug,
          isFlagged: f.post.isFlagged,
          flagCount: f.post.flagCount,
          author: f.post.user?.name ?? 'Unknown',
          flags: [],
          expanded: false,
        });
      }
      map.get(pid)!.flags.push(f);
    }
    return Array.from(map.values());
  });

  searchQuery = signal('');
  filteredGroups = computed(() => {
    const q = this.searchQuery().trim().toLowerCase();
    if (!q) return this.grouped();
    return this.grouped().filter(g =>
      g.postTitle.toLowerCase().includes(q) || g.author.toLowerCase().includes(q)
    );
  });

  readonly PAGE_SIZE = 10;
  currentPage = signal(1);
  totalPages  = computed(() => Math.max(1, Math.ceil(this.filteredGroups().length / this.PAGE_SIZE)));
  pagedGroups = computed(() => {
    const start = (this.currentPage() - 1) * this.PAGE_SIZE;
    return this.filteredGroups().slice(start, start + this.PAGE_SIZE);
  });

  goToPage(n: number): void {
    if (n < 1 || n > this.totalPages()) return;
    this.currentPage.set(n);
  }

  onSearchChange(value: string): void {
    this.searchQuery.set(value);
    this.currentPage.set(1);
  }

  ngOnInit(): void {
    this.loadFlags();
  }

  private headers(): HttpHeaders | undefined {
    const token = this.auth.getToken();
    return token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : undefined;
  }

  loadFlags(): void {
    this.isLoading.set(true);
    this.error.set('');
    const h = this.headers();
    this.http.get<any>(`${environment.apiUrl}/flag`, h ? { headers: h } : {}).subscribe({
      next: res => { this.flags.set(res.data ?? []); this.isLoading.set(false); },
      error: err => {
        this.error.set(err?.error?.message ?? 'Failed to load flags.');
        this.isLoading.set(false);
      },
    });
  }

  toggleExpand(group: GroupedFlags): void {
    this.flags.update(f => f); // force signal tick - we mutate grouped directly below
    group.expanded = !group.expanded;
    this.flags.update(f => [...f]); // nudge signal to re-render
  }

  requestResolveAll(group: GroupedFlags): void {
    this.pendingResolve.set(group);
  }

  confirmResolveAll(): void {
    const group = this.pendingResolve();
    this.pendingResolve.set(null);
    if (group) this.resolveAll(group);
  }

  resolveAll(group: GroupedFlags): void {
    const postId = group.postId;
    const resolving = new Set(this.resolving());
    resolving.add(postId);
    this.resolving.set(resolving);

    const h = this.headers();
    this.http.patch<any>(
      `${environment.apiUrl}/flag/${postId}/resolve`,
      {},
      h ? { headers: h } : {}
    ).subscribe({
      next: () => {
        this.flags.update(list => list.filter(f => f.post?._id !== postId));
        const r = new Set(this.resolving());
        r.delete(postId);
        this.resolving.set(r);
        if (this.selectedPostIds().has(postId)) {
          const s = new Set(this.selectedPostIds());
          s.delete(postId);
          this.selectedPostIds.set(s);
        }
      },
      error: err => {
        this.toast.show(err?.error?.message ?? 'Could not resolve flags.', 'error');
        const r = new Set(this.resolving());
        r.delete(postId);
        this.resolving.set(r);
      },
    });
  }

  // ── Bulk selection & resolve ─────────────────────────────────────────────
  selectedPostIds = signal<Set<string>>(new Set());

  isSelected(postId: string): boolean { return this.selectedPostIds().has(postId); }

  toggleSelect(postId: string): void {
    const next = new Set(this.selectedPostIds());
    if (next.has(postId)) next.delete(postId); else next.add(postId);
    this.selectedPostIds.set(next);
  }

  allOnPageSelected = computed(() =>
    this.pagedGroups().length > 0 && this.pagedGroups().every(g => this.selectedPostIds().has(g.postId))
  );

  toggleSelectAllOnPage(): void {
    const next = new Set(this.selectedPostIds());
    if (this.allOnPageSelected()) {
      this.pagedGroups().forEach(g => next.delete(g.postId));
    } else {
      this.pagedGroups().forEach(g => next.add(g.postId));
    }
    this.selectedPostIds.set(next);
  }

  clearSelection(): void { this.selectedPostIds.set(new Set()); }
  selectedCount = computed(() => this.selectedPostIds().size);

  pendingBulkResolve = signal(false);
  bulkBusy = signal(false);

  requestBulkResolve(): void {
    if (this.selectedCount()) this.pendingBulkResolve.set(true);
  }
  cancelBulkResolve(): void { this.pendingBulkResolve.set(false); }

  confirmBulkResolve(): void {
    this.pendingBulkResolve.set(false);
    if (this.bulkBusy()) return;
    const targets = this.grouped().filter(g => this.selectedPostIds().has(g.postId));
    if (!targets.length) return;

    this.bulkBusy.set(true);
    let remaining = targets.length;
    let failed = 0;
    const h = this.headers();

    targets.forEach(group => {
      const resolving = new Set(this.resolving());
      resolving.add(group.postId);
      this.resolving.set(resolving);

      this.http.patch<any>(`${environment.apiUrl}/flag/${group.postId}/resolve`, {}, h ? { headers: h } : {}).subscribe({
        next: () => {
          this.flags.update(list => list.filter(f => f.post?._id !== group.postId));
          const r = new Set(this.resolving()); r.delete(group.postId); this.resolving.set(r);
          remaining--;
          if (remaining === 0) this.finishBulkResolve(targets.length, failed);
        },
        error: () => {
          const r = new Set(this.resolving()); r.delete(group.postId); this.resolving.set(r);
          failed++; remaining--;
          if (remaining === 0) this.finishBulkResolve(targets.length, failed);
        },
      });
    });
  }

  private finishBulkResolve(total: number, failed: number): void {
    this.bulkBusy.set(false);
    this.clearSelection();
    if (failed === 0) {
      this.toast.show(`Resolved flags on ${total} post${total === 1 ? '' : 's'}.`, 'success');
    } else {
      this.toast.show(`Resolved ${total - failed} of ${total} - ${failed} failed.`, failed === total ? 'error' : 'warning');
    }
  }

  viewPost(group: GroupedFlags): void {
    this.router.navigate(['/blog', group.slug || group.postId]);
  }

  reasonLabel(reason: string): string {
    const labels: Record<string, string> = {
      misinformation: 'Misinformation',
      spam: 'Spam',
      inappropriate: 'Inappropriate',
      plagiarism: 'Plagiarism',
      hate_speech: 'Hate Speech',
      other: 'Other',
    };
    return labels[reason] ?? reason;
  }
}
