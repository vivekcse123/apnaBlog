import { CommonModule } from '@angular/common';
import {
  Component, DestroyRef, inject, OnInit, OnDestroy,
  AfterViewInit, ViewChild, ElementRef, signal
} from '@angular/core';
import { RouterModule } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { Chart, registerables } from 'chart.js';
import { PostService } from '../../../post/services/post-service';
import { AdminService } from '../../services/admin-service';
import { CreatePost } from '../../../post/pages/create-post/create-post';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Auth } from '../../../../core/services/auth';
import { DashboardCache } from '../../../../core/services/dashboard-cache';

Chart.register(...registerables);

@Component({
  selector: 'app-admin-home',
  standalone: true,
  imports: [CommonModule, RouterModule, CreatePost],
  templateUrl: './admin-home.html',
  styleUrl: './admin-home.css',
})
export class AdminHome implements OnInit, AfterViewInit, OnDestroy {

  // ── Chart canvas refs ──────────────────────────────────────
  @ViewChild('blogGrowthChartRef') blogGrowthChartRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('contentDoughnutRef') contentDoughnutRef!:  ElementRef<HTMLCanvasElement>;
  @ViewChild('engagementBarRef')   engagementBarRef!:    ElementRef<HTMLCanvasElement>;
  @ViewChild('userActivityRef')    userActivityRef!:     ElementRef<HTMLCanvasElement>;

  private blogGrowthChart!: Chart;
  private contentDoughnut!: Chart;
  private engagementBar!:   Chart;
  private userActivityBar!: Chart;

  // ── Services ───────────────────────────────────────────────
  private postService     = inject(PostService);
  private adminService    = inject(AdminService);
  private destroyRef      = inject(DestroyRef);
  private authService     = inject(Auth);
  private dashboardCache  = inject(DashboardCache);

  readonly currentUser = this.authService.getCurrentUser();
  readonly userId      = this.currentUser?.id ?? '';

  currentDate: Date = new Date();
  selectedRange: '7d' | '14d' | '30d' = '14d';

  // ── Signals ────────────────────────────────────────────────
  totalBlogs     = signal<number>(0);
  totalUsers     = signal<number>(0);
  totalPublished = signal<number>(0);
  totalDrafts    = signal<number>(0);
  totalPending   = signal<number>(0);
  totalViews     = signal<number>(0);
  totalComments  = signal<number>(0);
  totalLikes     = signal<number>(0);
  totalFollows   = signal<number>(0);
  activeUsers    = signal<number>(0);
  inactiveUsers  = signal<number>(0);

  newBlogs      = signal<number>(0);
  newUsers      = signal<number>(0);
  newPublished  = signal<number>(0);
  pendingReview = signal<number>(0);

  weekViews    = signal<number>(0);
  weekComments = signal<number>(0);
  weekLikes    = signal<number>(0);

  recentBlogs  = signal<any[]>([]);
  recentUsers  = signal<any[]>([]);
  inactiveList = signal<any[]>([]);

  isLoading       = signal<boolean>(true);
  isRefreshing    = signal<boolean>(false);
  showCreateModal = signal<boolean>(false);

  // ── Raw data store for chart rebuilds ─────────────────────
  private allPosts: any[] = [];
  private allUsers: any[] = [];

  // ── Lifecycle ─────────────────────────────────────────────
  ngOnInit(): void {
    this.loadDashboardData();
  }

  ngAfterViewInit(): void {
    // Safety-net: build charts after view is ready.
    // When data is already loaded from cache, this fires ~100ms after mount.
    setTimeout(() => this.buildAllCharts(), 100);
  }

  ngOnDestroy(): void {
    this.blogGrowthChart?.destroy();
    this.contentDoughnut?.destroy();
    this.engagementBar?.destroy();
    this.userActivityBar?.destroy();
  }

  // ── Data Loading ──────────────────────────────────────────

  loadDashboardData(): void {
    const cached = this.dashboardCache.get();

    if (cached) {
      // Serve instantly from cache
      this.allPosts = cached.posts;
      this.allUsers = cached.users;
      this.computeStats();
      this.isLoading.set(false);

      // Silently refresh in the background if the cache is stale (>60s old)
      if (this.dashboardCache.isStale()) {
        this.fetchFresh(false);
      }
      return;
    }

    // No cache — show loader and fetch fresh
    this.fetchFresh(true);
  }

  private fetchFresh(showLoader: boolean): void {
    if (showLoader) {
      this.isLoading.set(true);
    } else {
      this.isRefreshing.set(true);
    }

    forkJoin({
      posts:       this.postService.getAllPostAdmin(1, 1000),
      users:       this.adminService.getAllUsers(1, 1000),
<<<<<<< HEAD
      followStats: this.adminService.getFollowStats(),
=======
      followStats: this.adminService.getFollowStats().pipe(
        catchError(() => of({ status: 200, totalFollows: 0 }))
      ),
>>>>>>> dev
    })
    .pipe(takeUntilDestroyed(this.destroyRef))
    .subscribe({
      next: ({ posts, users, followStats }) => {
        this.allPosts = posts.data ?? [];
        this.allUsers = users.data ?? [];
        this.totalFollows.set(followStats.totalFollows ?? 0);
        this.dashboardCache.set(this.allPosts, this.allUsers);

        this.computeStats();
        this.isLoading.set(false);
        this.isRefreshing.set(false);

        // Rebuild charts with fresh data
        setTimeout(() => this.buildAllCharts(), 100);
      },
      error: (err) => {
        console.error('Dashboard load error:', err);
        this.isLoading.set(false);
        this.isRefreshing.set(false);
      },
    });
  }

  private computeStats(): void {
    const allPosts = this.allPosts;
    const allUsers = this.allUsers;

    const now           = new Date();
    const weekAgo       = new Date(now.getTime() - 7  * 24 * 60 * 60 * 1000);

    const published            = allPosts.filter((p: any) => p.status === 'published');
    const drafts               = allPosts.filter((p: any) => p.status === 'draft');
    const pending              = allPosts.filter((p: any) => p.status === 'pending');
    const newBlogsThisWeek     = allPosts.filter((p: any) => new Date(p.createdAt) >= weekAgo);
    const newPublishedThisWeek = published.filter((p: any) => new Date(p.createdAt) >= weekAgo);

    this.totalBlogs.set(allPosts.length);
    this.totalPublished.set(published.length);
    this.totalDrafts.set(drafts.length);
    this.totalPending.set(pending.length);
    this.newBlogs.set(newBlogsThisWeek.length);
    this.newPublished.set(newPublishedThisWeek.length);
    this.pendingReview.set(pending.length);

    const totalViews    = allPosts.reduce((s: number, p: any) => s + (p.views         ?? 0), 0);
    const totalComments = allPosts.reduce((s: number, p: any) => s + (p.commentsCount ?? 0), 0);
    const totalLikes    = allPosts.reduce((s: number, p: any) => s + (p.likesCount    ?? 0), 0);

    this.totalViews.set(totalViews);
    this.totalComments.set(totalComments);
    this.totalLikes.set(totalLikes);

    const activeThisWeek = allPosts.filter((p: any) => {
      const lastActivity = p.updatedAt ?? p.createdAt;
      return new Date(lastActivity) >= weekAgo;
    });

    this.weekViews.set(activeThisWeek.reduce((s: number, p: any) => s + (p.views         ?? 0), 0));
    this.weekComments.set(activeThisWeek.reduce((s: number, p: any) => s + (p.commentsCount ?? 0), 0));
    this.weekLikes.set(activeThisWeek.reduce((s: number, p: any) => s + (p.likesCount    ?? 0), 0));

    const active           = allUsers.filter((u: any) => u.status !== 'inactive');
    const inactive         = allUsers.filter((u: any) => u.status === 'inactive');
    const newUsersThisWeek = allUsers.filter((u: any) => new Date(u.createdAt) >= weekAgo);

    this.totalUsers.set(allUsers.length);
    this.newUsers.set(newUsersThisWeek.length);
    this.activeUsers.set(active.length);
    this.inactiveUsers.set(inactive.length);

    this.recentBlogs.set(
      [...allPosts]
        .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 5)
    );

    this.recentUsers.set(
      [...active]
        .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 5)
    );

    this.inactiveList.set(
      [...inactive]
        .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 5)
    );
  }

  // ── Range change ──────────────────────────────────────────
  onRangeChange(range: '7d' | '14d' | '30d'): void {
    this.selectedRange = range;
    this.buildOrUpdateBlogGrowthChart();
  }

  // ── Chart orchestrator ────────────────────────────────────
  private buildAllCharts(): void {
    this.buildOrUpdateBlogGrowthChart();
    this.buildOrUpdateContentDoughnut();
    this.buildOrUpdateEngagementBar();
    this.buildOrUpdateUserActivityBar();
  }

  // ── Blog Growth Line Chart ────────────────────────────────
  private buildOrUpdateBlogGrowthChart(): void {
    if (!this.blogGrowthChartRef) return;

    const days = this.selectedRange === '7d' ? 7 : this.selectedRange === '14d' ? 30 : 90;
    const { labels, published, drafts } = this.getTimeSeriesData(days);

    if (this.blogGrowthChart) {
      this.blogGrowthChart.data.labels              = labels;
      this.blogGrowthChart.data.datasets[0].data   = published;
      this.blogGrowthChart.data.datasets[1].data   = drafts;
      this.blogGrowthChart.update('active');
      return;
    }

    this.blogGrowthChart = new Chart(this.blogGrowthChartRef.nativeElement, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Published',
            data: published,
            borderColor: '#43cea2',
            backgroundColor: 'rgba(67,206,162,0.10)',
            fill: true,
            tension: 0.45,
            pointRadius: 3,
            pointBackgroundColor: '#43cea2',
            borderWidth: 2,
          },
          {
            label: 'Drafts',
            data: drafts,
            borderColor: '#BA7517',
            backgroundColor: 'rgba(186,117,23,0.08)',
            fill: true,
            tension: 0.45,
            pointRadius: 3,
            pointBackgroundColor: '#BA7517',
            borderWidth: 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: {
            display: true,
            position: 'top',
            align: 'end',
            labels: { boxWidth: 10, font: { size: 11 }, padding: 12 },
          },
          tooltip: { mode: 'index', intersect: false },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { font: { size: 10 }, maxTicksLimit: 8 },
          },
          y: {
            beginAtZero: true,
            grid: { color: 'rgba(0,0,0,0.04)' },
            ticks: { font: { size: 10 }, precision: 0 },
          },
        },
      },
    });
  }

  // ── Content Status Doughnut ───────────────────────────────
  private buildOrUpdateContentDoughnut(): void {
    if (!this.contentDoughnutRef) return;

    const data   = [this.totalPublished(), this.totalDrafts(), this.totalPending()];
    const labels = ['Published', 'Drafts', 'Pending'];
    const colors = ['#43cea2', '#BA7517', '#dc2626'];

    if (this.contentDoughnut) {
      this.contentDoughnut.data.datasets[0].data = data;
      this.contentDoughnut.update('active');
      return;
    }

    this.contentDoughnut = new Chart(this.contentDoughnutRef.nativeElement, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{
          data,
          backgroundColor: colors,
          borderWidth: 3,
          borderColor: 'transparent',
          hoverOffset: 6,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '68%',
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => ` ${ctx.label}: ${ctx.parsed}`,
            },
          },
        },
      },
    });
  }

  // ── Weekly Engagement Grouped Bar ─────────────────────────
  private buildOrUpdateEngagementBar(): void {
    if (!this.engagementBarRef) return;

    const { labels, viewsData, commentsData, likesData } = this.getEngagementData(7);

    if (this.engagementBar) {
      this.engagementBar.data.labels              = labels;
      this.engagementBar.data.datasets[0].data   = viewsData;
      this.engagementBar.data.datasets[1].data   = commentsData;
      this.engagementBar.data.datasets[2].data   = likesData;
      this.engagementBar.update('active');
      return;
    }

    this.engagementBar = new Chart(this.engagementBarRef.nativeElement, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Views',
            data: viewsData,
            backgroundColor: 'rgba(127,119,221,0.75)',
            borderColor: '#7F77DD',
            borderWidth: 1,
            borderRadius: 4,
          },
          {
            label: 'Comments',
            data: commentsData,
            backgroundColor: 'rgba(55,138,221,0.75)',
            borderColor: '#378ADD',
            borderWidth: 1,
            borderRadius: 4,
          },
          {
            label: 'Likes',
            data: likesData,
            backgroundColor: 'rgba(217,83,79,0.75)',
            borderColor: '#d9534f',
            borderWidth: 1,
            borderRadius: 4,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: {
            display: true,
            position: 'top',
            align: 'end',
            labels: { boxWidth: 10, font: { size: 10 }, padding: 10 },
          },
        },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 10 } } },
          y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.04)' }, ticks: { font: { size: 10 }, precision: 0 } },
        },
      },
    });
  }

  // ── User Activity Horizontal Bar ──────────────────────────
  private buildOrUpdateUserActivityBar(): void {
    if (!this.userActivityRef) return;

    const labels = ['Total Users', 'Active', 'Inactive', 'New This Week'];
    const data   = [
      this.totalUsers(),
      this.activeUsers(),
      this.inactiveUsers(),
      this.newUsers(),
    ];
    const colors = ['#185a9d', '#43cea2', '#dc2626', '#7F77DD'];

    if (this.userActivityBar) {
      this.userActivityBar.data.datasets[0].data = data;
      this.userActivityBar.update('active');
      return;
    }

    this.userActivityBar = new Chart(this.userActivityRef.nativeElement, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Users',
          data,
          backgroundColor: colors.map(c => c + 'cc'),
          borderColor: colors,
          borderWidth: 1.5,
          borderRadius: 6,
        }],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: { label: (ctx) => ` ${ctx.parsed.x} users` },
          },
        },
        scales: {
          x: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.04)' }, ticks: { font: { size: 10 }, precision: 0 } },
          y: { grid: { display: false }, ticks: { font: { size: 11 } } },
        },
      },
    });
  }

  // ── Helpers: time-series data from allPosts ───────────────
  private getTimeSeriesData(days: number): {
    labels: string[];
    published: number[];
    drafts: number[];
  } {
    const now    = new Date();
    const labels: string[]  = [];
    const published: number[] = [];
    const drafts: number[]    = [];

    const granularity = days <= 14 ? 'day' : 'week';
    const buckets     = granularity === 'day' ? days : Math.ceil(days / 7);

    for (let i = buckets - 1; i >= 0; i--) {
      let start: Date, end: Date, label: string;

      if (granularity === 'day') {
        start = new Date(now); start.setDate(now.getDate() - i);     start.setHours(0,0,0,0);
        end   = new Date(start); end.setHours(23,59,59,999);
        label = start.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
      } else {
        end   = new Date(now); end.setDate(now.getDate() - i * 7);
        start = new Date(end); start.setDate(end.getDate() - 6);     start.setHours(0,0,0,0);
        end.setHours(23,59,59,999);
        label = start.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
      }

      labels.push(label);
      published.push(this.allPosts.filter((p: any) =>
        p.status === 'published' &&
        new Date(p.createdAt) >= start && new Date(p.createdAt) <= end
      ).length);
      drafts.push(this.allPosts.filter((p: any) =>
        (p.status === 'draft' || p.status === 'pending') &&
        new Date(p.createdAt) >= start && new Date(p.createdAt) <= end
      ).length);
    }

    return { labels, published, drafts };
  }

  private getEngagementData(days: number): {
    labels: string[];
    viewsData: number[];
    commentsData: number[];
    likesData: number[];
  } {
    const now  = new Date();
    const labels: string[]       = [];
    const viewsData: number[]    = [];
    const commentsData: number[] = [];
    const likesData: number[]    = [];

    for (let i = days - 1; i >= 0; i--) {
      const start = new Date(now); start.setDate(now.getDate() - i); start.setHours(0,0,0,0);
      const end   = new Date(start); end.setHours(23,59,59,999);

      const dayPosts = this.allPosts.filter((p: any) => {
        const d = new Date(p.updatedAt ?? p.createdAt);
        return d >= start && d <= end;
      });

      labels.push(start.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }));
      viewsData.push(dayPosts.reduce((s: number, p: any) => s + (p.views         ?? 0), 0));
      commentsData.push(dayPosts.reduce((s: number, p: any) => s + (p.commentsCount ?? 0), 0));
      likesData.push(dayPosts.reduce((s: number, p: any) => s + (p.likesCount    ?? 0), 0));
    }

    return { labels, viewsData, commentsData, likesData };
  }

  // ── Utility ───────────────────────────────────────────────
  getInitials(name: string): string {
    if (!name) return 'U';
    return name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2);
  }

  getPercent(value: number, total: number): number {
    if (!total || total === 0) return 0;
    return Math.min(Math.round((value / total) * 100), 100);
  }
}
