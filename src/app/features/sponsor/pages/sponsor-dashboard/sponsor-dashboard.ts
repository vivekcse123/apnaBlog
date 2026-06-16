import {
  ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal, PLATFORM_ID
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, of } from 'rxjs';
import { environment } from '../../../../../environments/environment';
import { Auth } from '../../../../core/services/auth';
import { ThemeService } from '../../../../core/services/theme-service';
import { CreateCampaign } from '../../components/create-campaign/create-campaign';
import { ShortsUpload } from '../../../shorts/pages/shorts-upload/shorts-upload';
import { MobileBottomNav } from '../../../../shared/mobile-bottom-nav/mobile-bottom-nav';

interface ClickAnalytics {
  totalClicks:     number;
  uniqueClicks:    number;
  ctr:             number;   // percentage
  lastClickAt:     string | null;
  dailyTrend:      { date: string; clicks: number }[];
  deviceBreakdown: { desktop: number; mobile: number };
}

interface SponsoredItem {
  _id: string;
  title: string;
  categories?: string[];
  category?: string;
  featuredImage?: string;
  thumbnailUrl?: string;
  views: number;
  likesCount: number;
  commentsCount: number;
  status: string;
  isSponsored: boolean;
  isActive: boolean;
  isExpired: boolean;
  sponsoredUntil?: string | null;
  sponsoredExpiryAction?: string | null;
  sponsorPriority?: number;
  sponsorCtaUrl?: string | null;
  daysLeft: number | null;
  daysRan: number;
  createdAt: string;
  user?: { name: string };
  clickAnalytics?: ClickAnalytics;
}

interface ReportStats {
  total: number; active: number; expired: number; totalViews: number; totalLikes: number;
  totalClicks?: number;
}

@Component({
  selector: 'app-sponsor-dashboard',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterLink, CreateCampaign, ShortsUpload, MobileBottomNav],
  templateUrl: './sponsor-dashboard.html',
  styleUrl:    './sponsor-dashboard.css',
})
export class SponsorDashboard implements OnInit {
  private http       = inject(HttpClient);
  private auth       = inject(Auth);
  private destroyRef = inject(DestroyRef);
  private platformId = inject(PLATFORM_ID);
  themeService       = inject(ThemeService);

  private postApi   = `${environment.apiPostEndpoint.replace(/\/+$/, '')}/sponsor-report`;
  private shortsApi = `${environment.apiShortsEndpoint.replace(/\/+$/, '')}/sponsor-report`;

  activeTab       = signal<'blogs' | 'shorts'>('blogs');
  showCreateModal = signal(false);
  showShortsModal = signal(false);

  blogs        = signal<SponsoredItem[]>([]);
  shorts       = signal<SponsoredItem[]>([]);
  blogStats    = signal<ReportStats | null>(null);
  shortStats   = signal<ReportStats | null>(null);
  blogsLoading  = signal(true);
  shortsLoading = signal(true);

  totalStats = computed(() => {
    const b = this.blogStats();
    const s = this.shortStats();
    if (!b && !s) return null;
    return {
      total:        (b?.total        ?? 0) + (s?.total        ?? 0),
      active:       (b?.active       ?? 0) + (s?.active       ?? 0),
      totalViews:   (b?.totalViews   ?? 0) + (s?.totalViews   ?? 0),
      totalLikes:   (b?.totalLikes   ?? 0) + (s?.totalLikes   ?? 0),
      totalClicks:  (b?.totalClicks  ?? 0) + (s?.totalClicks  ?? 0),
    };
  });

  isLoading = computed(() => this.blogsLoading() || this.shortsLoading());

  ngOnInit(): void {
    this.loadBlogs();
    this.loadShorts();
  }

  private loadBlogs(): void {
    this.blogsLoading.set(true);
    this.http.get<{ status: number; data: SponsoredItem[]; stats: ReportStats }>(this.postApi)
      .pipe(takeUntilDestroyed(this.destroyRef), catchError(() => of(null)))
      .subscribe(res => {
        this.blogs.set(res?.data ?? []);
        this.blogStats.set(res?.stats ?? null);
        this.blogsLoading.set(false);
      });
  }

  private loadShorts(): void {
    this.shortsLoading.set(true);
    this.http.get<{ status: number; data: SponsoredItem[]; stats: ReportStats }>(this.shortsApi)
      .pipe(takeUntilDestroyed(this.destroyRef), catchError(() => of(null)))
      .subscribe(res => {
        this.shorts.set(res?.data ?? []);
        this.shortStats.set(res?.stats ?? null);
        this.shortsLoading.set(false);
      });
  }

  priorityLabel(p?: number): string {
    if (p === 1) return 'High';
    if (p === 2) return 'Medium';
    return 'Standard';
  }

  priorityColor(p?: number): string {
    if (p === 1) return '#ef4444';
    if (p === 2) return '#f59e0b';
    return '#22c55e';
  }

  ctrBarWidth(ctr: number): number { return Math.min(ctr * 10, 100); }

  ctrColor(ctr: number): string {
    if (ctr >= 3)  return '#16a34a';
    if (ctr >= 1)  return '#f59e0b';
    return '#94a3b8';
  }

  formatCount(n: number): string {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
    if (n >= 1_000)     return (n / 1_000).toFixed(1) + 'k';
    return String(n);
  }

  formatDate(d: string): string {
    return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  daysLeftLabel(item: SponsoredItem): string {
    if (!item.sponsoredUntil) return '—';
    const diff = Math.ceil((new Date(item.sponsoredUntil).getTime() - Date.now()) / 86_400_000);
    if (diff < 0)  return 'Expired';
    if (diff === 0) return 'Expires today';
    return `${diff}d left`;
  }

  daysLeftColor(item: SponsoredItem): string {
    if (!item.sponsoredUntil) return '#94a3b8';
    const diff = Math.ceil((new Date(item.sponsoredUntil).getTime() - Date.now()) / 86_400_000);
    if (diff < 0)  return '#ef4444';
    if (diff <= 3) return '#f59e0b';
    return '#16a34a';
  }

  exportCsv(type: 'blogs' | 'shorts'): void {
    if (!isPlatformBrowser(this.platformId)) return;
    const items = type === 'blogs' ? this.blogs() : this.shorts();
    if (!items.length) return;

    const headers = ['Title', 'Status', 'Sponsored', 'Views', 'Likes', 'Comments',
                     'Clicks', 'Unique Clicks', 'CTR (%)', 'Campaign Start', 'Campaign End', 'Days Left'];
    const rows = items.map(i => [
      `"${(i.title ?? '').replace(/"/g, '""')}"`,
      i.status,
      i.isSponsored ? 'Yes' : 'No',
      i.views,
      i.likesCount,
      i.commentsCount,
      i.clickAnalytics?.totalClicks  ?? 0,
      i.clickAnalytics?.uniqueClicks ?? 0,
      i.clickAnalytics?.ctr?.toFixed(2) ?? '0.00',
      this.formatDate(i.createdAt),
      i.sponsoredUntil ? this.formatDate(i.sponsoredUntil) : '—',
      this.daysLeftLabel(i),
    ]);

    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `apnainsights-${type}-analytics-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  get userName(): string { return this.auth.userName() ?? ''; }

  logout(): void { this.auth.logout(); }
}
