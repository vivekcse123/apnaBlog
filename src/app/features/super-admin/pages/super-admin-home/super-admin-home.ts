import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, signal
} from '@angular/core';
import { RouterModule } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { PostService } from '../../../post/services/post-service';
import { AdminService } from '../../../admin/services/admin-service';
import { Auth } from '../../../../core/services/auth';
import { environment } from '../../../../../environments/environment';
import { hasLifetimeAccess } from '../../../../core/utils/lifetime-membership.util';

@Component({
  selector: 'app-super-admin-home',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterModule],
  templateUrl: './super-admin-home.html',
  styleUrl: './super-admin-home.css',
})
export class SuperAdminHome implements OnInit {
  private postService  = inject(PostService);
  private adminService = inject(AdminService);
  private authService  = inject(Auth);
  private destroyRef   = inject(DestroyRef);
  private http         = inject(HttpClient);

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
  premiumCount   = signal(0);
  lifetimeCount  = signal(0);
  recentUsers    = signal<any[]>([]);
  inactiveList   = signal<any[]>([]);
  categoryCounts = signal<{ name: string; count: number }[]>([]);

  // ── Traffic snapshot (preview of the visitor/ page) ───────
  trafficToday   = signal<number>(0);
  trafficWeek    = signal<number>(0);
  trafficMonth   = signal<number>(0);
  trafficTopPage = signal<string>('');
  sourceStats    = signal<{ source: string; percent: number }[]>([]);

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

          const catMap = new Map<string, number>();
          for (const p of all) {
            for (const c of (p.categories ?? [])) {
              catMap.set(c, (catMap.get(c) ?? 0) + 1);
            }
          }
          this.categoryCounts.set(
            Array.from(catMap.entries())
              .map(([name, count]) => ({ name, count }))
              .sort((a, b) => b.count - a.count)
              .slice(0, 5)
          );
        }
        if (users?.data) {
          const all = users.data as any[];
          this.totalUsers.set(all.length);
          this.activeUsers.set(all.filter(u => u.status === 'active').length);
          const inactive = all.filter(u => u.status === 'inactive');
          this.inactiveUsers.set(inactive.length);
          this.inactiveList.set(inactive.slice(0, 4));
          this.adminCount.set(all.filter(u => u.role === 'admin').length);
          this.superAdminCount.set(all.filter(u => u.role === 'super_admin').length);
          this.premiumCount.set(all.filter(u => u.isPremium).length);
          this.lifetimeCount.set(all.filter(u => hasLifetimeAccess(u)).length);
          this.recentUsers.set(all.slice(0, 5));
        }
        this.isLoading.set(false);
      });

    this.loadTrafficSnapshot();
  }

  private loadTrafficSnapshot(): void {
    this.http.get<{ today: number; thisWeek: number; thisMonth: number }>(`${environment.apiUrl}/visitor/stats`)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.trafficToday.set(res.today ?? 0);
          this.trafficWeek.set(res.thisWeek ?? 0);
          this.trafficMonth.set(res.thisMonth ?? 0);
        },
        error: () => {},
      });

    this.http.get<{ _id: string; count: number }[]>(`${environment.apiUrl}/visitor/top-pages`)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => this.trafficTopPage.set(res?.[0]?._id ?? ''),
        error: () => {},
      });

    this.http.get<{ source: string; percent: number }[]>(`${environment.apiUrl}/visitor/sources`)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => this.sourceStats.set((res ?? []).slice(0, 4)),
        error: () => {},
      });
  }

  getInitials(name: string): string {
    const p = name?.trim().split(' ') ?? [];
    return ((p[0]?.charAt(0) ?? '') + (p[1]?.charAt(0) ?? '')).toUpperCase();
  }
}
