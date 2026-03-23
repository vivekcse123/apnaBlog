import { CommonModule } from '@angular/common';
import { Component, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { forkJoin } from 'rxjs';
import { PostService } from '../../../post/services/post-service';
import { AdminService } from '../../services/admin-service';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

@Component({
  selector: 'app-admin-home',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './admin-home.html',
  styleUrl: './admin-home.css',
})
export class AdminHome implements OnInit {
  private postService  = inject(PostService);
  private adminService = inject(AdminService);
  private destroyRef = inject(DestroyRef);

  currentDate: Date = new Date();

  totalBlogs     = signal<number>(0);
  totalUsers     = signal<number>(0);
  totalPublished = signal<number>(0);
  totalDrafts    = signal<number>(0);
  totalViews     = signal<number>(0);
  totalComments  = signal<number>(0);
  totalLikes     = signal<number>(0);
  activeUsers    = signal<number>(0);
  inactiveUsers  = signal<number>(0);

  newBlogs      = signal<number>(0);
  newUsers      = signal<number>(0);
  newPublished  = signal<number>(0);
  pendingReview = signal<number>(0);
  newViews      = signal<number>(0);
  newComments   = signal<number>(0);
  newLikes      = signal<number>(0);

  recentBlogs  = signal<any[]>([]);
  recentUsers  = signal<any[]>([]);
  inactiveList = signal<any[]>([]);

  isLoading = signal<boolean>(true);

  ngOnInit(): void {
    this.loadDashboardData();
  }

  loadDashboardData(): void {
    forkJoin({
      posts: this.postService.getAllPost(1, 1000),
      users: this.adminService.getAllUsers(1, 1000),
    })
    .pipe(
      takeUntilDestroyed(this.destroyRef)
    )
    .subscribe({
      next: ({ posts, users }) => {
        const allPosts = posts.data ?? [];
        const allUsers = users.data ?? [];

        const now           = new Date();
        const weekAgo       = new Date(now.getTime() - 7  * 24 * 60 * 60 * 1000);
        const todayStart    = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

        const published            = allPosts.filter((p: any) => p.status === 'published');
        const drafts               = allPosts.filter((p: any) => p.status === 'draft');
        const newBlogsThisWeek     = allPosts.filter((p: any) => new Date(p.createdAt) >= weekAgo);
        const newPublishedThisWeek = published.filter((p: any) => new Date(p.createdAt) >= weekAgo);

        this.totalBlogs.set(allPosts.length);
        this.totalPublished.set(published.length);
        this.totalDrafts.set(drafts.length);
        this.newBlogs.set(newBlogsThisWeek.length);
        this.newPublished.set(newPublishedThisWeek.length);
        this.pendingReview.set(drafts.length);

        const views    = allPosts.reduce((s: number, p: any) => s + (p.views         ?? 0), 0);
        const comments = allPosts.reduce((s: number, p: any) => s + (p.commentsCount ?? 0), 0);
        const likes    = allPosts.reduce((s: number, p: any) => s + (p.likesCount    ?? 0), 0);

        this.totalViews.set(views);
        this.totalComments.set(comments);
        this.totalLikes.set(likes);

        const todayPosts = allPosts.filter((p: any) => new Date(p.createdAt) >= todayStart);
        this.newViews.set(todayPosts.reduce((s: number, p: any) => s + (p.views         ?? 0), 0));
        this.newComments.set(todayPosts.reduce((s: number, p: any) => s + (p.commentsCount ?? 0), 0));
        this.newLikes.set(todayPosts.reduce((s: number, p: any) => s + (p.likesCount    ?? 0), 0));

        const active   = allUsers.filter((u: any) => u.status !== 'inactive');
        const inactive = allUsers.filter((u: any) => u.status === 'inactive');
        const newUsersThisWeek = allUsers.filter((u: any) => new Date(u.createdAt) >= weekAgo);
        const activeLast30     = active.filter((u: any) => new Date(u.createdAt) >= thirtyDaysAgo);

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

        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Dashboard load error:', err);
        this.isLoading.set(false);
      },
    });
  }

  getInitials(name: string): string {
    if (!name) return 'U';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  }
}