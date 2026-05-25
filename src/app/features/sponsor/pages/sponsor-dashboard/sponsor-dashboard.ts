import {
  ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, ActivatedRoute } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, of } from 'rxjs';
import { environment } from '../../../../../environments/environment';
import { Auth } from '../../../../core/services/auth';
import { ThemeService } from '../../../../core/services/theme-service';
import { CreatePost } from '../../../post/pages/create-post/create-post';
import { ShortsUpload } from '../../../shorts/pages/shorts-upload/shorts-upload';
import { MobileBottomNav } from '../../../../shared/mobile-bottom-nav/mobile-bottom-nav';

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
  daysLeft: number | null;
  daysRan: number;
  createdAt: string;
  user?: { name: string };
}

interface ReportStats {
  total: number; active: number; expired: number; totalViews: number; totalLikes: number;
}

@Component({
  selector: 'app-sponsor-dashboard',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterLink, CreatePost, ShortsUpload, MobileBottomNav],
  templateUrl: './sponsor-dashboard.html',
  styleUrl:    './sponsor-dashboard.css',
})
export class SponsorDashboard implements OnInit {
  private route      = inject(ActivatedRoute);
  private http       = inject(HttpClient);
  private auth       = inject(Auth);
  private destroyRef = inject(DestroyRef);
  themeService       = inject(ThemeService);

  private postApi   = `${environment.apiPostEndpoint.replace(/\/+$/, '')}/sponsor-report`;
  private shortsApi = `${environment.apiShortsEndpoint.replace(/\/+$/, '')}/sponsor-report`;

  userId          = signal('');
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
      total:      (b?.total  ?? 0) + (s?.total  ?? 0),
      active:     (b?.active ?? 0) + (s?.active ?? 0),
      totalViews: (b?.totalViews ?? 0) + (s?.totalViews ?? 0),
      totalLikes: (b?.totalLikes ?? 0) + (s?.totalLikes ?? 0),
    };
  });

  isLoading = computed(() => this.blogsLoading() || this.shortsLoading());

  ngOnInit(): void {
    const id = this.route.snapshot.params['id'];
    this.userId.set(id);
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
    if (p === 1) return '1 · High';
    if (p === 2) return '2 · Medium';
    return '3 · Standard';
  }

  priorityColor(p?: number): string {
    if (p === 1) return '#ef4444';
    if (p === 2) return '#f59e0b';
    return '#22c55e';
  }

  formatCount(n: number): string {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
    if (n >= 1_000)     return (n / 1_000).toFixed(1) + 'k';
    return String(n);
  }

  formatDate(d: string): string {
    return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  get userName(): string { return this.auth.userName() ?? ''; }

  logout(): void { this.auth.logout(); }
}
