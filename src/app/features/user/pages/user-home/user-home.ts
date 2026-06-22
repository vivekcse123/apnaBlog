import { CommonModule, isPlatformBrowser, DOCUMENT } from '@angular/common';
import { Meta } from '@angular/platform-browser';
import {
  AfterViewInit, ChangeDetectionStrategy, Component, DestroyRef, ElementRef, OnDestroy, OnInit, PLATFORM_ID, ViewChild, computed, inject, signal
} from '@angular/core';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Chart, registerables } from 'chart.js';
import { PostService } from '../../../post/services/post-service';
import { UserService } from '../../../user/services/user-service';
import { ShortsService } from '../../../shorts/services/shorts.service';
import { DashboardCache } from '../../../../core/services/dashboard-cache';
import { CreatePost } from '../../../post/pages/create-post/create-post';

Chart.register(...registerables);

@Component({
  selector: 'app-user-home',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterModule, CreatePost],
  templateUrl: './user-home.html',
  styleUrl: './user-home.css',
})
export class UserHome implements OnInit, AfterViewInit, OnDestroy {

  @ViewChild('blogGrowthRef') blogGrowthRef!: ElementRef<HTMLCanvasElement>;

  private blogGrowthChart!: Chart;

  private postService    = inject(PostService);
  private userService    = inject(UserService);
  private shortsService  = inject(ShortsService);
  private destroyRef     = inject(DestroyRef);
  private route          = inject(ActivatedRoute);
  readonly router        = inject(Router);
  private platformId     = inject(PLATFORM_ID);
  private document       = inject(DOCUMENT);
  private dashboardCache = inject(DashboardCache);
  private meta           = inject(Meta);

  currentDate = new Date();
  selectedRange: '7d' | '14d' | '30d' = '14d';

  user            = signal<any>(null);
  userId          = signal<string>('');
  followersCount  = signal<number>(0);
  isLoading       = signal<boolean>(true);
  isRefreshing    = signal<boolean>(false);

  shortsCount    = signal<number>(0);

  totalBlogs     = signal<number>(0);
  totalPublished = signal<number>(0);
  totalDrafts    = signal<number>(0);
  totalViews     = signal<number>(0);
  totalLikes     = signal<number>(0);
  totalComments  = signal<number>(0);
  topPostViews   = signal<number>(0);
  newBlogs       = signal<number>(0);
  writingStreak  = signal<number>(0);

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

  // ── Social profile extras ──────────────────────────────────────

  readonly greeting: string = (() => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  })();

  userInitials = computed(() => {
    const name = this.user()?.name || '';
    return name.split(' ').filter(Boolean).map((n: string) => n[0]).join('').toUpperCase().slice(0, 2) || 'U';
  });

  achievementBadges = computed(() => [
    { id: 'first',       icon: '✍️', label: 'First Story',          desc: 'Published your first blog',     earned: this.totalPublished() >= 1  },
    { id: 'storyteller', icon: '📚', label: 'Storyteller',          desc: 'Published 5+ stories',          earned: this.totalPublished() >= 5  },
    { id: 'prolific',    icon: '🏆', label: 'Prolific Writer',      desc: '10+ stories published',         earned: this.totalPublished() >= 10 },
    { id: 'views100',    icon: '👁️', label: '100 Views',            desc: 'Reached 100 total views',       earned: this.totalViews() >= 100    },
    { id: 'views1k',     icon: '🚀', label: '1K Views',             desc: 'Reached 1,000 total views',     earned: this.totalViews() >= 1000   },
    { id: 'liked',       icon: '❤️', label: 'Crowd Pleaser',        desc: 'Received 10+ likes',            earned: this.totalLikes() >= 10     },
    { id: 'community',   icon: '🤝', label: 'Community Builder',    desc: 'Gained 5+ followers',           earned: this.followersCount() >= 5  },
    { id: 'engaged',     icon: '💬', label: 'Conversation Starter', desc: 'Received 5+ comments',          earned: this.totalComments() >= 5   },
  ]);

  earnedBadgeCount = computed(() =>
    this.achievementBadges().filter(b => b.earned).length
  );

  recentBlogs   = signal<any[]>([]);
  topBlogs      = signal<any[]>([]);
  showBlogsModal     = signal(false);
  blogsModalList     = signal<any[]>([]);
  showCreateModal    = signal(false);
  showFollowersModal = signal(false);
  followersList      = signal<any[]>([]);
  followersLoading   = signal(false);

  createBlogLink  = computed(() => `/user/${this.userId()}/create-blog`);
  manageBlogsLink = computed(() => `/user/${this.userId()}/manage-blogs`);
  settingsLink    = computed(() => `/user/${this.userId()}/settings`);
  exploreLink     = computed(() => `/user/${this.userId()}/explore-blogs`);
  myShortsLink    = computed(() => `/user/${this.userId()}/my-shorts`);

  private allPosts: any[] = [];

  ngOnInit(): void {
    this.meta.updateTag({ name: 'robots', content: 'noindex, nofollow' });
    const uid = this.route.snapshot.params['id'];
    this.userId.set(uid);
    if (!uid) return;

    this.shortsService.getMyShorts(1, 1)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: (res) => this.shortsCount.set(res.total ?? 0), error: () => {} });

    this.userService.getUserById(uid)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.user.set(res.data);
          this.followersCount.set(res.followersCount ?? 0);
        },
        error: () => {},
      });

    const cachedPosts = this.dashboardCache.getUserPosts(uid);
    if (cachedPosts) {
      this.allPosts = cachedPosts;
      this.computeStats();
      this.isLoading.set(false);
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
        error: () => {
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

    // Writing streak - count consecutive days with at least one post
    const allDayTs = posts
      .map((p: any) => {
        const d = new Date(p.createdAt);
        return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
      })
      .filter((v: number, i: number, a: number[]) => a.indexOf(v) === i)
      .sort((a: number, b: number) => b - a);

    let streak = 0;
    const todayMidnight = new Date(); todayMidnight.setHours(0, 0, 0, 0);
    let checkDay = todayMidnight.getTime();
    const oneDay = 86_400_000;
    for (const dayTs of allDayTs) {
      if (dayTs === checkDay || dayTs === checkDay - oneDay) {
        streak++;
        checkDay = dayTs - oneDay;
      } else { break; }
    }
    this.writingStreak.set(streak);
  }

  onRangeChange(range: '7d' | '14d' | '30d'): void {
    this.selectedRange = range;
    this.buildOrUpdateBlogGrowthChart();
  }

  private buildAllCharts(): void {
    this.buildOrUpdateBlogGrowthChart();
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

  openFollowersModal(): void {
    this.showFollowersModal.set(true);
    if (isPlatformBrowser(this.platformId)) this.document.body.style.overflow = 'hidden';

    if (this.followersList().length === 0) {
      this.followersLoading.set(true);
      this.userService.getFollowers(this.userId())
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (res) => {
            this.followersList.set(res.data ?? []);
            this.followersLoading.set(false);
          },
          error: () => this.followersLoading.set(false),
        });
    }
  }

  closeFollowersModal(): void {
    this.showFollowersModal.set(false);
    if (isPlatformBrowser(this.platformId)) this.document.body.style.overflow = '';
  }

  visitFollower(follower: any): void {
    const post = follower.latestPost;
    if (!post) return;
    this.closeFollowersModal();
    this.router.navigate(['/blog', post.slug || post.postId]);
  }

  viewBlog(blog: any): void {
    this.router.navigate(['/blog', blog.slug || blog._id]);
  }

  openBlog(postId: string): void {
    this.closeBlogsModal();
    this.router.navigate(['/blog', postId]);
  }

  getInitials(name: string): string {
    if (!name) return 'U';
    return name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2);
  }

}
