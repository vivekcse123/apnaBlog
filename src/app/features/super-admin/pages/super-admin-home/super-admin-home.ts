import { CommonModule } from '@angular/common';
import { Component, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { RouterModule } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { PostService } from '../../../post/services/post-service';
import { AdminService } from '../../../admin/services/admin-service';
import { Auth } from '../../../../core/services/auth';

@Component({
  selector: 'app-super-admin-home',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './super-admin-home.html',
  styleUrl: './super-admin-home.css',
})
export class SuperAdminHome implements OnInit {
  private postService  = inject(PostService);
  private adminService = inject(AdminService);
  private authService  = inject(Auth);
  private destroyRef   = inject(DestroyRef);

  readonly currentUser = this.authService.getCurrentUser();
  readonly userId      = this.currentUser?.id ?? '';

  currentDate = new Date();
  isLoading   = signal(true);

  totalBlogs     = signal(0);
  totalUsers     = signal(0);
  totalPublished = signal(0);
  totalDrafts    = signal(0);
  totalPending   = signal(0);
  totalViews     = signal(0);
  totalComments  = signal(0);
  totalLikes     = signal(0);
  activeUsers    = signal(0);
  inactiveUsers  = signal(0);
  adminCount     = signal(0);
  superAdminCount = signal(0);
  recentUsers    = signal<any[]>([]);

  ngOnInit(): void {
    forkJoin({
      posts: this.postService.getAllPostAdmin(1, 1000).pipe(catchError(() => of(null))),
      users: this.adminService.getAllUsersRaw(1, 1000).pipe(catchError(() => of(null))),
    }).pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(({ posts, users }) => {
        if (posts?.data) {
          const all = posts.data as any[];
          this.totalBlogs.set(all.length);
          this.totalPublished.set(all.filter(p => p.status === 'published').length);
          this.totalDrafts.set(all.filter(p => p.status === 'draft').length);
          this.totalPending.set(all.filter(p => p.status === 'pending').length);
          this.totalViews.set(all.reduce((s, p) => s + (p.views ?? 0), 0));
          this.totalComments.set(all.reduce((s, p) => s + (p.commentsCount ?? 0), 0));
          this.totalLikes.set(all.reduce((s, p) => s + (p.likesCount ?? 0), 0));
        }
        if (users?.data) {
          const all = users.data as any[];
          this.totalUsers.set(all.length);
          this.activeUsers.set(all.filter(u => u.status === 'active').length);
          this.inactiveUsers.set(all.filter(u => u.status === 'inactive').length);
          this.adminCount.set(all.filter(u => u.role === 'admin').length);
          this.superAdminCount.set(all.filter(u => u.role === 'super_admin').length);
          this.recentUsers.set(all.slice(0, 5));
        }
        this.isLoading.set(false);
      });
  }

  getInitials(name: string): string {
    const p = name?.trim().split(' ') ?? [];
    return ((p[0]?.charAt(0) ?? '') + (p[1]?.charAt(0) ?? '')).toUpperCase();
  }
}
