import { CommonModule, isPlatformBrowser, DOCUMENT } from '@angular/common';
import {
  Component, DestroyRef, inject, OnInit, OnDestroy,
  AfterViewInit, ViewChild, ElementRef, signal, computed, PLATFORM_ID
} from '@angular/core';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Chart, registerables } from 'chart.js';
import { PostService } from '../../../post/services/post-service';
import { UserService } from '../../../user/services/user-service';
import { DashboardCache } from '../../../../core/services/dashboard-cache';
import { CreatePost } from '../../../post/pages/create-post/create-post';

Chart.register(...registerables);

@Component({
  selector: 'app-user-home',
  standalone: true,
  imports: [CommonModule, RouterModule, CreatePost],
  templateUrl: './user-home.html',
  styleUrl: './user-home.css',
})
export class UserHome implements OnInit, AfterViewInit, OnDestroy {

  @ViewChild('blogGrowthRef')    blogGrowthRef!:    ElementRef<HTMLCanvasElement>;
  @ViewChild('contentDonutRef')  contentDonutRef!:  ElementRef<HTMLCanvasElement>;
  @ViewChild('engagementRef')    engagementRef!:    ElementRef<HTMLCanvasElement>;
  @ViewChild('topPostsRef')      topPostsRef!:      ElementRef<HTMLCanvasElement>;

  private blogGrowthChart!:   Chart;
  private contentDonutChart!: Chart;
  private engagementChart!:   Chart;
  private topPostsChart!:     Chart;

  private postService    = inject(PostService);
  private userService    = inject(UserService);
  private destroyRef     = inject(DestroyRef);
  private route          = inject(ActivatedRoute);
  private router         = inject(Router);
  private platformId     = inject(PLATFORM_ID);
  private document       = inject(DOCUMENT);
  private dashboardCache = inject(DashboardCache);

  currentDate = new Date();
  selectedRange: '7d' | '14d' | '30d' = '14d';

  user         = signal<any>(null);
  userId       = signal<string>('');
  isLoading    = signal<boolean>(true);
  isRefreshing = signal<boolean>(false);

  totalBlogs     = signal<number>(0);
  totalPublished = signal<number>(0);
  totalDrafts    = signal<number>(0);
  totalViews     = signal<number>(0);
  totalLikes     = signal<number>(0);
  totalComments  = signal<number>(0);
  topPostViews   = signal<number>(0);
  newBlogs       = signal<number>(0);

  avgViews = computed(() =>
    this.totalBlogs() > 0
      ? Math.round(this.totalViews() / this.totalBlogs())
      : 0
  );

  publishedPercent = computed(() =>
    this.totalBlogs() > 0
      ? Math.round((this.totalPublished() / this.totalBlogs()) * 100)
      : 0
  );

  recentBlogs   = signal<any[]>([]);
  topBlogs      = signal<any[]>([]);
  showBlogsModal  = signal(false);
  blogsModalList  = signal<any[]>([]);
  showCreateModal = signal(false);

  createBlogLink  = computed(() => `/user/${this.userId()}/manage-blogs`);
  manageBlogsLink = computed(() => `/user/${this.userId()}/manage-blogs`);
  settingsLink    = computed(() => `/user/${this.userId()}/settings`);
  exploreLink     = computed(() => `/user/${this.userId()}/explore-blogs`);

  private allPosts: any[] = [];

  ngOnInit(): void {
    const uid = this.route.snapshot.params['id'];
    this.userId.set(uid);
    if (!uid) return;

    // User profile is lightweight — always fetch fresh
    this.userService.getUserById(uid)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => this.user.set(res.data),
        error: (err) => console.error('Failed to load user:', err),
      });

    // Posts: cache-first
    const cachedPosts = this.dashboardCache.getUserPosts(uid);
    if (cachedPosts) {
      this.allPosts = cachedPosts;
      this.computeStats();
      this.isLoading.set(false);

      // Silently refresh if stale
      if (this.dashboardCache.isUserDataStale(uid)) {
        this.fetchUserPosts(uid, false);
      }
      return;
    }

    this.fetchUserPosts(uid, true);
  }

  ngAfterViewInit(): void {
    setTimeout(() => this.buildAllCharts(), 100);
  }

  ngOnDestroy(): void {
    this.blogGrowthChart?.destroy();
    this.contentDonutChart?.destroy();
    this.engagementChart?.destroy();
    this.topPostsChart?.destroy();
    if (isPlatformBrowser(this.platformId)) this.document.body.style.overflow = '';
  }

  private fetchUserPosts(uid: string, showLoader: boolean): void {
    if (showLoader) {
      this.isLoading.set(true);
    } else {
      this.isRefreshing.set(true);
    }

    this.postService.getPostByUserId(uid, 1, 1000)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.allPosts = res.data ?? [];
          this.dashboardCache.setUserPosts(uid, this.allPosts);
          this.computeStats();
          this.isLoading.set(false);
          this.isRefreshing.set(false);
          setTimeout(() => this.buildAllCharts(), 100);
        },
        error: (err) => {
          console.error('Failed to load posts:', err);
          this.isLoading.set(false);
          this.isRefreshing.set(false);
        },
      });
  }

  private computeStats(): void {
    const posts   = this.allPosts;
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const published   = posts.filter((p: any) => p.status === 'published');
    const drafts      = posts.filter((p: any) => p.status === 'draft');
    const newThisWeek = posts.filter((p: any) => new Date(p.createdAt) >= weekAgo);

    this.totalBlogs.set(posts.length);
    this.totalPublished.set(published.length);
    this.totalDrafts.set(drafts.length);
    this.newBlogs.set(newThisWeek.length);

    this.totalViews.set(posts.reduce((s: number, p: any) => s + (p.views         ?? 0), 0));
    this.totalLikes.set(posts.reduce((s: number, p: any) => s + (p.likesCount    ?? 0), 0));
    this.totalComments.set(posts.reduce((s: number, p: any) => s + (p.commentsCount ?? 0), 0));
    this.topPostViews.set(posts.length > 0 ? Math.max(...posts.map((p: any) => p.views ?? 0)) : 0);

    this.recentBlogs.set(
      [...posts]
        .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 5)
    );

    this.topBlogs.set(
      [...published]
        .sort((a: any, b: any) => (b.views ?? 0) - (a.views ?? 0))
        .slice(0, 5)
    );

    this.blogsModalList.set(
      [...posts].sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    );
  }

  onRangeChange(range: '7d' | '14d' | '30d'): void {
    this.selectedRange = range;
    this.buildOrUpdateBlogGrowthChart();
  }

  private buildAllCharts(): void {
    this.buildOrUpdateBlogGrowthChart();
    this.buildOrUpdateContentDonut();
    this.buildOrUpdateEngagementChart();
    this.buildOrUpdateTopPostsChart();
  }

  private buildOrUpdateBlogGrowthChart(): void {
    if (!this.blogGrowthRef) return;

    const days = this.selectedRange === '7d' ? 7 : this.selectedRange === '14d' ? 30 : 90;
    const { labels, published, drafts } = this.getTimeSeriesData(days);

    if (this.blogGrowthChart) {
      this.blogGrowthChart.data.labels            = labels;
      this.blogGrowthChart.data.datasets[0].data  = published;
      this.blogGrowthChart.data.datasets[1].data  = drafts;
      this.blogGrowthChart.update('active');
      return;
    }

    this.blogGrowthChart = new Chart(this.blogGrowthRef.nativeElement, {
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
        },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 10 }, maxTicksLimit: 8 } },
          y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.04)' }, ticks: { font: { size: 10 }, precision: 0 } },
        },
      },
    });
  }

  private buildOrUpdateContentDonut(): void {
    if (!this.contentDonutRef) return;

    const data   = [this.totalPublished(), this.totalDrafts()];
    const labels = ['Published', 'Drafts'];
    const colors = ['#43cea2', '#BA7517'];

    if (this.contentDonutChart) {
      this.contentDonutChart.data.datasets[0].data = data;
      this.contentDonutChart.update('active');
      return;
    }

    this.contentDonutChart = new Chart(this.contentDonutRef.nativeElement, {
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
            callbacks: { label: (ctx) => ` ${ctx.label}: ${ctx.parsed}` },
          },
        },
      },
    });
  }

  private buildOrUpdateEngagementChart(): void {
    if (!this.engagementRef) return;

    const { labels, viewsData, commentsData, likesData } = this.getEngagementData(7);

    if (this.engagementChart) {
      this.engagementChart.data.labels            = labels;
      this.engagementChart.data.datasets[0].data  = viewsData;
      this.engagementChart.data.datasets[1].data  = commentsData;
      this.engagementChart.data.datasets[2].data  = likesData;
      this.engagementChart.update('active');
      return;
    }

    this.engagementChart = new Chart(this.engagementRef.nativeElement, {
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

  private buildOrUpdateTopPostsChart(): void {
    if (!this.topPostsRef) return;

    const top5    = this.topBlogs().slice(0, 5);
    const labels  = top5.map((p: any) =>
      p.title.length > 22 ? p.title.slice(0, 22) + '…' : p.title
    );
    const views   = top5.map((p: any) => p.views ?? 0);
    const colors  = ['#43cea2cc', '#185a9dcc', '#7F77DDcc', '#BA7517cc', '#d9534fcc'];
    const borders = ['#43cea2',   '#185a9d',   '#7F77DD',   '#BA7517',   '#d9534f'];

    if (this.topPostsChart) {
      this.topPostsChart.data.labels            = labels;
      this.topPostsChart.data.datasets[0].data  = views;
      this.topPostsChart.update('active');
      return;
    }

    this.topPostsChart = new Chart(this.topPostsRef.nativeElement, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Views',
          data: views,
          backgroundColor: colors,
          borderColor: borders,
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
            callbacks: { label: (ctx) => ` ${ctx.parsed.x} views` },
          },
        },
        scales: {
          x: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.04)' }, ticks: { font: { size: 10 }, precision: 0 } },
          y: { grid: { display: false }, ticks: { font: { size: 10 } } },
        },
      },
    });
  }

  private getTimeSeriesData(days: number): {
    labels: string[]; published: number[]; drafts: number[];
  } {
    const now         = new Date();
    const labels:    string[]  = [];
    const published: number[]  = [];
    const drafts:    number[]  = [];

    const granularity = days <= 14 ? 'day' : 'week';
    const buckets     = granularity === 'day' ? days : Math.ceil(days / 7);

    for (let i = buckets - 1; i >= 0; i--) {
      let start: Date, end: Date, label: string;

      if (granularity === 'day') {
        start = new Date(now); start.setDate(now.getDate() - i); start.setHours(0,0,0,0);
        end   = new Date(start); end.setHours(23,59,59,999);
        label = start.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
      } else {
        end   = new Date(now); end.setDate(now.getDate() - i * 7);
        start = new Date(end); start.setDate(end.getDate() - 6); start.setHours(0,0,0,0);
        end.setHours(23,59,59,999);
        label = start.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
      }

      labels.push(label);
      published.push(this.allPosts.filter((p: any) =>
        p.status === 'published' &&
        new Date(p.createdAt) >= start && new Date(p.createdAt) <= end
      ).length);
      drafts.push(this.allPosts.filter((p: any) =>
        p.status === 'draft' &&
        new Date(p.createdAt) >= start && new Date(p.createdAt) <= end
      ).length);
    }

    return { labels, published, drafts };
  }

  private getEngagementData(days: number): {
    labels: string[]; viewsData: number[]; commentsData: number[]; likesData: number[];
  } {
    const now          = new Date();
    const labels:       string[]  = [];
    const viewsData:    number[]  = [];
    const commentsData: number[]  = [];
    const likesData:    number[]  = [];

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

  onPostCreated(): void {
    this.showCreateModal.set(false);
    this.fetchUserPosts(this.userId(), false);
  }

  openBlogsModal(): void {
    this.showBlogsModal.set(true);
    if (isPlatformBrowser(this.platformId)) this.document.body.style.overflow = 'hidden';
  }

  closeBlogsModal(): void {
    this.showBlogsModal.set(false);
    if (isPlatformBrowser(this.platformId)) this.document.body.style.overflow = '';
  }

  openBlog(postId: string): void {
    this.closeBlogsModal();
    this.router.navigate(['/blog', postId]);
  }

  getInitials(name: string): string {
    if (!name) return 'U';
    return name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2);
  }

  getPercent(value: number, total: number): number {
    if (!total) return 0;
    return Math.min(Math.round((value / total) * 100), 100);
  }
}
