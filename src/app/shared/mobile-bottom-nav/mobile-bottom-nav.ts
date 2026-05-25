import { Component, Input, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { Auth } from '../../core/services/auth';

@Component({
  selector: 'app-mobile-bottom-nav',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, CommonModule],
  templateUrl: './mobile-bottom-nav.html',
  styleUrl: './mobile-bottom-nav.css',
})
export class MobileBottomNav {
  /** 'public' = landing pages, 'dashboard' = authenticated area */
  @Input() mode: 'public' | 'dashboard' = 'public';

  private auth   = inject(Auth);
  private router = inject(Router);

  isLoggedIn = computed(() => !!this.auth.getCurrentUser());

  private get currentUser() { return this.auth.getCurrentUser(); }
  private get userRole(): string { return this.currentUser?.role?.toLowerCase() ?? ''; }
  private get userId(): string { return this.currentUser?.id ?? ''; }

  get isAdminMode(): boolean {
    return this.mode === 'dashboard' && this.userRole === 'admin';
  }

  get isSuperAdminMode(): boolean {
    return this.mode === 'dashboard' && this.userRole === 'super_admin';
  }

  get isUserDashboard(): boolean {
    return this.mode === 'dashboard' && this.userRole === 'user';
  }

  get dashboardRoute(): string {
    if (!this.currentUser) return '/auth/login';
    if (this.userRole === 'admin')       return `/admin/${this.userId}`;
    if (this.userRole === 'super_admin') return `/super-admin/${this.userId}`;
    return `/user/${this.userId}`;
  }

  get homeRoute(): string {
    return this.mode === 'dashboard' ? this.dashboardRoute : '/';
  }

  /* ── Admin-specific routes ── */
  get adminBlogsRoute(): string {
    if (this.userRole === 'admin')       return `/admin/${this.userId}/manage-blogs`;
    if (this.userRole === 'super_admin') return `/super-admin/${this.userId}/manage-blogs`;
    return `/user/${this.userId}/manage-blogs`;
  }

  get adminUsersRoute(): string {
    if (this.userRole === 'admin')       return `/admin/${this.userId}/manage-users`;
    if (this.userRole === 'super_admin') return `/super-admin/${this.userId}/manage-users`;
    return '/';
  }

  get adminShortsRoute(): string {
    if (this.userRole === 'admin')       return `/admin/${this.userId}/manage-shorts`;
    if (this.userRole === 'super_admin') return `/super-admin/${this.userId}/manage-shorts`;
    return '/';
  }

  get roleManagementRoute(): string {
    return `/super-admin/${this.userId}/role-management`;
  }

  get taxonomyRoute(): string {
    return `/super-admin/${this.userId}/manage-taxonomy`;
  }

  get myShortsRoute(): string {
    return `/user/${this.userId}/my-shorts`;
  }

  get adminAnalyticsRoute(): string {
    if (this.userRole === 'admin')       return `/admin/${this.userId}/visitor`;
    if (this.userRole === 'super_admin') return `/super-admin/${this.userId}/visitor`;
    return '/';
  }

  /* ── Public/User routes ── */
  get exploreRoute(): string {
    if (this.mode === 'dashboard') {
      if (this.userRole === 'admin')       return `/admin/${this.userId}/manage-blogs`;
      if (this.userRole === 'super_admin') return `/super-admin/${this.userId}/manage-blogs`;
      return `/user/${this.userId}/manage-blogs`;
    }
    return '/search';
  }

  get writeRoute(): string {
    if (!this.currentUser) return '/auth/login';
    if (this.userRole === 'admin')       return `/admin/${this.userId}/create-blog`;
    if (this.userRole === 'super_admin') return `/super-admin/${this.userId}/create-blog`;
    return `/user/${this.userId}/create-blog`;
  }

  get savedRoute(): string { return '/bookmarks'; }

  get shortsRoute(): string { return '/shorts'; }

  get profileRoute(): string {
    if (!this.currentUser) return '/auth/login';
    if (this.userRole === 'admin')       return `/admin/${this.userId}/settings`;
    if (this.userRole === 'super_admin') return `/super-admin/${this.userId}/settings`;
    return `/user/${this.userId}/settings`;
  }

  /** Public-mode last nav item: routes to dashboard if logged in, else login */
  get publicProfileRoute(): string {
    if (!this.currentUser) return '/auth/login';
    return this.dashboardRoute;
  }

  get publicProfileLabel(): string {
    return this.currentUser ? 'Dashboard' : 'Sign In';
  }

  get homeLabel(): string {
    return this.mode === 'dashboard' ? 'Dashboard' : 'Home';
  }

  get exploreLabel(): string {
    return this.mode === 'dashboard' ? 'Blogs' : 'Explore';
  }
}
