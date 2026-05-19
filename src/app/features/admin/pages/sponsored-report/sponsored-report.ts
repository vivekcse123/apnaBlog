import { Component, inject, signal, computed, OnInit, DestroyRef, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { environment } from '../../../../../environments/environment';
import { ToastService } from '../../../../core/services/toast.service';
import { PostService } from '../../../post/services/post-service';

interface SponsoredShort {
  _id: string;
  title: string;
  caption?: string;
  category: string;
  thumbnailUrl?: string;
  views: number;
  likesCount: number;
  commentsCount: number;
  status: string;
  isSponsored: boolean;
  isActive: boolean;
  isExpired: boolean;
  sponsoredUntil?: string;
  sponsoredExpiryAction?: string;
  daysLeft: number | null;
  daysRan: number;
  createdAt: string;
  user?: { name: string };
}

interface SponsoredBlog {
  _id: string;
  title: string;
  description?: string;
  categories: string[];
  featuredImage?: string;
  views: number;
  likesCount: number;
  commentsCount: number;
  status: string;
  isSponsored: boolean;
  isActive: boolean;
  isExpired: boolean;
  sponsoredUntil?: string;
  sponsoredExpiryAction?: string;
  daysLeft: number | null;
  daysRan: number;
  createdAt: string;
  user?: { name: string };
}

interface ReportStats {
  total: number; active: number; expired: number; totalViews: number; totalLikes: number;
}

interface Inquiry {
  _id: string;
  company: string;
  name: string;
  email: string;
  phone?: string;
  adType: string;
  budget: string;
  message: string;
  status: 'new' | 'contacted' | 'closed';
  read: boolean;
  createdAt: string;
}

const AD_TYPE_LABELS: Record<string, string> = {
  sponsored_short: 'Sponsored Short',
  blog_feature:    'Blog Feature',
  newsletter:      'Newsletter',
  multiple:        'Multiple / Custom',
};

@Component({
  selector: 'app-sponsored-report',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './sponsored-report.html',
  styleUrl:    './sponsored-report.css',
})
export class SponsoredReport implements OnInit {
  private http        = inject(HttpClient);
  private destroyRef  = inject(DestroyRef);
  private platformId  = inject(PLATFORM_ID);
  private toast       = inject(ToastService);
  private postService = inject(PostService);

  private api        = `${environment.apiUrl}/shorts/admin/sponsored-report`;
  private inquiryApi = `${environment.apiUrl}/sponsorship`;

  // Main tab
  activeTab = signal<'performance' | 'inquiries'>('inquiries');

  // Performance sub-tab
  perfTab = signal<'shorts' | 'blogs'>('shorts');

  // Shorts performance
  shorts    = signal<SponsoredShort[]>([]);
  stats     = signal<ReportStats | null>(null);
  isLoading = signal(true);
  filter    = signal<'all' | 'active' | 'expired'>('all');

  // Blogs performance
  blogs        = signal<SponsoredBlog[]>([]);
  blogStats    = signal<ReportStats | null>(null);
  blogsLoading = signal(false);
  blogFilter   = signal<'all' | 'active' | 'expired'>('all');

  // Inquiries tab
  inquiries        = signal<Inquiry[]>([]);
  inquiriesLoading = signal(true);
  newInquiryCount  = computed(() => this.inquiries().filter(i => i.status === 'new').length);
  activeInquiry    = signal<Inquiry | null>(null);

  filtered = computed(() => {
    const f = this.filter();
    const list = this.shorts();
    if (f === 'active')  return list.filter(s => s.isActive);
    if (f === 'expired') return list.filter(s => s.isExpired);
    return list;
  });

  filteredBlogs = computed(() => {
    const f = this.blogFilter();
    const list = this.blogs();
    if (f === 'active')  return list.filter(b => b.isActive);
    if (f === 'expired') return list.filter(b => b.isExpired);
    return list;
  });

  topByViews = computed(() =>
    [...this.shorts()].sort((a, b) => b.views - a.views).slice(0, 3)
  );

  topBlogsByViews = computed(() =>
    [...this.blogs()].sort((a, b) => b.views - a.views).slice(0, 3)
  );

  readonly adTypeLabel = (t: string) => AD_TYPE_LABELS[t] ?? t;

  ngOnInit(): void {
    this.load();
    this.loadBlogs();
    this.loadInquiries();
  }

  load(): void {
    this.isLoading.set(true);
    this.http.get<{ status: number; data: SponsoredShort[]; stats: ReportStats }>(this.api)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: res => {
          this.shorts.set(res.data ?? []);
          this.stats.set(res.stats ?? null);
          this.isLoading.set(false);
        },
        error: () => this.isLoading.set(false),
      });
  }

  loadBlogs(): void {
    this.blogsLoading.set(true);
    this.postService.getSponsoredBlogsReport()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: res => {
          this.blogs.set(res.data ?? []);
          this.blogStats.set(res.stats ?? null);
          this.blogsLoading.set(false);
        },
        error: () => this.blogsLoading.set(false),
      });
  }

  setFilter(f: 'all' | 'active' | 'expired'): void { this.filter.set(f); }
  setBlogFilter(f: 'all' | 'active' | 'expired'): void { this.blogFilter.set(f); }

  loadInquiries(): void {
    this.inquiriesLoading.set(true);
    this.http.get<{ status: number; data: Inquiry[] }>(`${this.inquiryApi}?limit=100`)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: r => { this.inquiries.set(r.data ?? []); this.inquiriesLoading.set(false); },
        error: () => this.inquiriesLoading.set(false),
      });
  }

  openMessage(inq: Inquiry): void  { this.activeInquiry.set(inq); }
  closeMessage(): void { this.activeInquiry.set(null); }

  updateInquiryStatus(inq: Inquiry, status: 'new' | 'contacted' | 'closed'): void {
    this.http.patch<{ status: number; data: Inquiry }>(`${this.inquiryApi}/${inq._id}/status`, { status, read: true })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: res => {
          this.inquiries.update(list => list.map(i => i._id === inq._id ? { ...i, ...res.data } : i));
          this.toast.show(`Marked as ${status}.`, 'success');
        },
        error: () => this.toast.show('Update failed.', 'error'),
      });
  }

  formatCount(n: number): string {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
    if (n >= 1_000)     return (n / 1_000).toFixed(1) + 'k';
    return String(n);
  }

  formatDate(d: string): string {
    return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  exportCSV(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    const rows = [
      ['Title', 'Category', 'Status', 'Views', 'Likes', 'Comments', 'Days Ran', 'Days Left', 'Expiry Action', 'Sponsored Until', 'Author', 'Created'],
      ...this.shorts().map(s => [
        `"${s.title.replace(/"/g, '""')}"`,
        s.category,
        s.isActive ? 'Active' : s.isExpired ? 'Expired' : 'No Expiry',
        s.views, s.likesCount, s.commentsCount, s.daysRan,
        s.daysLeft ?? 'Unlimited',
        s.sponsoredExpiryAction ?? '—',
        s.sponsoredUntil ? this.formatDate(s.sponsoredUntil) : '—',
        s.user?.name ?? '—',
        this.formatDate(s.createdAt),
      ]),
    ];
    this._downloadCSV(rows, `sponsored-shorts-${new Date().toISOString().slice(0, 10)}.csv`);
  }

  exportBlogCSV(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    const rows = [
      ['Title', 'Categories', 'Status', 'Views', 'Likes', 'Comments', 'Days Ran', 'Days Left', 'Expiry Action', 'Sponsored Until', 'Author', 'Created'],
      ...this.blogs().map(b => [
        `"${b.title.replace(/"/g, '""')}"`,
        b.categories.join(';'),
        b.isActive ? 'Active' : b.isExpired ? 'Expired' : 'No Expiry',
        b.views, b.likesCount, b.commentsCount, b.daysRan,
        b.daysLeft ?? 'Unlimited',
        b.sponsoredExpiryAction ?? '—',
        b.sponsoredUntil ? this.formatDate(b.sponsoredUntil) : '—',
        b.user?.name ?? '—',
        this.formatDate(b.createdAt),
      ]),
    ];
    this._downloadCSV(rows, `sponsored-blogs-${new Date().toISOString().slice(0, 10)}.csv`);
  }

  private _downloadCSV(rows: any[][], filename: string): void {
    const csv  = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }
}
