import { CommonModule } from '@angular/common';
import { Component, DestroyRef, inject, Input, OnInit, signal, computed } from '@angular/core';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { PostService } from '../../../post/services/post-service';
import { UserService } from '../../../user/services/user-service';
import { Auth } from '../../../../core/services/auth';

@Component({
  selector: 'app-user-home',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './user-home.html',
  styleUrl: './user-home.css',
})
export class UserHome implements OnInit {
  private postService = inject(PostService);
  private userService = inject(UserService);
  private destroyRef  = inject(DestroyRef);
  private route = inject(ActivatedRoute);

  currentDate = new Date();

  user       = signal<any>(null);
  userId = signal<string>('');
  isLoading  = signal<boolean>(true);

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

  recentBlogs = signal<any[]>([]);
  topBlogs    = signal<any[]>([]);

  createBlogLink  = computed(() => `/user/${this.userId()}/manage-blogs`);
  manageBlogsLink = computed(() => `/user/${this.userId()}/manage-blogs`);
  settingsLink    = computed(() => `/user/${this.userId()}/settings`);
  exploreLink     = computed(() => `/user/${this.userId()}/explore-blogs`);

  ngOnInit(): void {
    const userId = this.route.snapshot.params['id'];
    this.userId.set(userId);
    if (!userId) return;

    this.userService.getUserById(userId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => this.user.set(res.data),
        error: (err) => console.error('Failed to load user:', err),
      });

    this.postService.getPostByUserId(userId, 1, 1000)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          const posts = res.data ?? [];

          const now     = new Date();
          const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

          const published = posts.filter((p: any) => p.status === 'published');
          const drafts    = posts.filter((p: any) => p.status === 'draft');
          const newThisWeek = posts.filter((p: any) => new Date(p.createdAt) >= weekAgo);

          this.totalBlogs.set(posts.length);
          this.totalPublished.set(published.length);
          this.totalDrafts.set(drafts.length);
          this.newBlogs.set(newThisWeek.length);

          const views    = posts.reduce((s: number, p: any) => s + (p.views         ?? 0), 0);
          const likes    = posts.reduce((s: number, p: any) => s + (p.likesCount    ?? 0), 0);
          const comments = posts.reduce((s: number, p: any) => s + (p.commentsCount ?? 0), 0);

          this.totalViews.set(views);
          this.totalLikes.set(likes);
          this.totalComments.set(comments);

          const topViews = posts.length > 0
            ? Math.max(...posts.map((p: any) => p.views ?? 0))
            : 0;
          this.topPostViews.set(topViews);

          // recent 5
          this.recentBlogs.set(
            [...posts]
              .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
              .slice(0, 5)
          );

          // top 5 by views
          this.topBlogs.set(
            [...published]
              .sort((a: any, b: any) => (b.views ?? 0) - (a.views ?? 0))
              .slice(0, 5)
          );

          this.isLoading.set(false);
        },
        error: (err) => {
          console.error('Failed to load posts:', err);
          this.isLoading.set(false);
        },
      });
  }
}