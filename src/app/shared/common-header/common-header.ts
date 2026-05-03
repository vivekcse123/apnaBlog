import { Component, ElementRef, EventEmitter, HostListener, Input, OnInit, Output, ViewChild, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { NotificationPanel } from '../components/notification-panel/notification-panel';
import { NotificationService } from '../../core/services/notification-service';
import { ThemeService } from '../../core/services/theme-service';
import { DashboardCache } from '../../core/services/dashboard-cache';
import { Auth } from '../../core/services/auth';

interface NavItem { label: string; routerLink: string; icon?: string; }
interface Suggestion { label: string; emoji: string; route: string; queryParams?: any; type: string; }

@Component({
  selector: 'app-common-header',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, CommonModule, MatIconModule, NotificationPanel, FormsModule],
  templateUrl: './common-header.html',
  styleUrls: ['./common-header.css'],
})
export class CommonHeader implements OnInit {
  @Input() logo:      string = 'ApnaInsights';
  @Input() profile:   string | null = '';
  @Input() name:      string | null = null;
  @Input() avatarUrl: string | null = null;
  @Input() userRole:  string | null = null;
  @Input() navs:      NavItem[] = [];
  @Input() set panelOpen(v: boolean) { this.profileOpen = v; }

  @Output() open         = new EventEmitter<void>();
  @Output() searchChange = new EventEmitter<string>();
  @Output() menuToggle   = new EventEmitter<void>();

  get displayName(): string { return this.name || this.profile || ''; }
  get firstName():   string { return (this.name || this.profile || '').split(' ')[0]; }

  menuOpen        = false;
  profileOpen     = false;
  searchQuery     = '';
  showSuggestions = false;

  private readonly CATEGORIES = [
    { label: 'Technology', emoji: '📱' },
    { label: 'Health',     emoji: '❤️' },
    { label: 'Lifestyle',  emoji: '🌿' },
    { label: 'Education',  emoji: '📚' },
    { label: 'Business',   emoji: '💼' },
    { label: 'Sports',     emoji: '🏏' },
    { label: 'Village',    emoji: '🌾' },
    { label: 'Cooking',    emoji: '🍳' },
    { label: 'Quotes',     emoji: '💬' },
    { label: 'Exercise',   emoji: '🏋️' },
    { label: 'Social',     emoji: '🤝' },
    { label: 'Entertainment', emoji: '🎭' },
    { label: 'News',       emoji: '📰' },
    { label: 'Update',     emoji: '📢' },
  ];

  private notifSvc      = inject(NotificationService);
  private dashboardCache = inject(DashboardCache);
  private auth           = inject(Auth);
  themeService           = inject(ThemeService);

  ngOnInit(): void {}

  getRoleLabel(): string {
    if (this.userRole === 'super_admin') return 'Super Admin';
    if (this.userRole === 'admin')       return 'Admin';
    return 'User';
  }

  getRoleIcon(): string {
    if (this.userRole === 'super_admin') return '★';
    if (this.userRole === 'admin')       return '⚡';
    return '●';
  }

  get blogsRoute(): string {
    return this.roleLinks.find(n => n.route.includes('manage-blogs'))?.route ?? '';
  }

  get usersRoute(): string {
    return this.roleLinks.find(n => n.route.includes('manage-users'))?.route ?? '';
  }

  private get cachedPosts(): any[] {
    const role = this.auth.getCurrentUser()?.role?.toLowerCase() ?? '';
    const isAdmin = role === 'admin' || role === 'super_admin';
    if (isAdmin) return this.dashboardCache.getAdminPosts() ?? [];
    const uid = this.auth.userId();
    return uid ? (this.dashboardCache.getUserPosts(uid) ?? []) : [];
  }

  private get cachedUsers(): any[] {
    const role = this.auth.getCurrentUser()?.role?.toLowerCase() ?? '';
    if (role === 'super_admin') return this.dashboardCache.getRawUsers() ?? [];
    return this.dashboardCache.getAdminUsers() ?? [];
  }

  get blogSuggestions(): { _id: string; slug: string; title: string; category: string; status: string; author: string }[] {
    const q = this.searchQuery.trim().toLowerCase();
    const posts = this.cachedPosts;
    const filtered = q
      ? posts.filter((p: any) => p.title?.toLowerCase().includes(q))
      : posts.slice().sort((a: any, b: any) =>
          new Date(b.updatedAt ?? b.createdAt).getTime() - new Date(a.updatedAt ?? a.createdAt).getTime()
        );
    const limit = q ? 5 : 3;
    return filtered.slice(0, limit).map((p: any) => ({
      _id:      p._id,
      slug:     p.slug || p._id,
      title:    p.title,
      category: p.categories?.[0] ?? '',
      status:   p.status ?? 'draft',
      author:   (p.user as any)?.name ?? '',
    }));
  }

  get userSuggestions(): { _id: string; name: string; email: string; role: string; status: string; initial: string; color: string }[] {
    if (!this.usersRoute) return [];
    const q = this.searchQuery.trim().toLowerCase();
    const users = this.cachedUsers;
    const filtered = q
      ? users.filter((u: any) =>
          u.name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q)
        )
      : users.slice().sort((a: any, b: any) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
    const limit = q ? 4 : 3;
    return filtered.slice(0, limit).map((u: any) => ({
      _id:     u._id,
      name:    u.name,
      email:   u.email,
      role:    u.role,
      status:  u.status ?? 'active',
      initial: (u.name as string)?.charAt(0).toUpperCase() ?? '?',
      color:   this.avatarColor(u.name),
    }));
  }

  private avatarColor(name: string): string {
    const colors = ['#43cea2','#185a9d','#f59e0b','#8b5cf6','#ef4444','#06b6d4','#10b981','#f97316'];
    let hash = 0;
    for (const c of name ?? '') hash = c.charCodeAt(0) + ((hash << 5) - hash);
    return colors[Math.abs(hash) % colors.length];
  }

  get isAdmin(): boolean {
    const r = this.auth.getCurrentUser()?.role?.toLowerCase() ?? '';
    return r === 'admin' || r === 'super_admin';
  }

  private get roleLinks(): { label: string; icon: string; route: string }[] {
    const uid  = this.auth.userId() ?? '';
    // Prefer the @Input userRole (always set by parent dashboard) to avoid
    // localStorage reads failing during SSR or before auth initialises.
    const role = (this.userRole ?? this.auth.getCurrentUser()?.role ?? '').toLowerCase();

    if (role === 'super_admin') return [
      { label: 'Home',            icon: 'home',     route: `/super-admin/${uid}` },
      { label: 'Role Management', icon: 'shield',   route: `/super-admin/${uid}/role-management` },
      { label: 'Users',           icon: 'users',    route: `/super-admin/${uid}/manage-users` },
      { label: 'Blogs',           icon: 'docs',     route: `/super-admin/${uid}/manage-blogs` },
      { label: 'Traffic',         icon: 'chart',    route: `/super-admin/${uid}/visitor` },
      { label: 'Settings',        icon: 'settings', route: `/super-admin/${uid}/settings` },
    ];

    if (role === 'admin') return [
      { label: 'Home',     icon: 'home',     route: `/admin/${uid}` },
      { label: 'Users',    icon: 'users',    route: `/admin/${uid}/manage-users` },
      { label: 'Blogs',    icon: 'docs',     route: `/admin/${uid}/manage-blogs` },
      { label: 'Traffic',  icon: 'chart',    route: `/admin/${uid}/visitor` },
      { label: 'Settings', icon: 'settings', route: `/admin/${uid}/settings` },
    ];

    return [
      { label: 'Home',    icon: 'home',     route: `/user/${uid}` },
      { label: 'Blogs',   icon: 'docs',     route: `/user/${uid}/manage-blogs` },
      { label: 'Explore', icon: 'search',   route: `/user/${uid}/explore-blogs` },
      { label: 'Settings',icon: 'settings', route: `/user/${uid}/settings` },
    ];
  }

  get navSuggestions(): { label: string; icon: string; route: string }[] {
    const q = this.searchQuery.trim().toLowerCase();
    const list = q
      ? this.roleLinks.filter(n => n.label.toLowerCase().includes(q))
      : this.roleLinks;
    return list.slice(0, 6);
  }

  get suggestions(): Suggestion[] {
    const q = this.searchQuery.trim().toLowerCase();
    if (!q) return [];
    const exploreRoute = this.exploreRoute;
    return this.CATEGORIES
      .filter(c => c.label.toLowerCase().includes(q))
      .slice(0, 4)
      .map(c => ({
        label: c.label,
        emoji: c.emoji,
        route: exploreRoute,
        queryParams: { category: c.label },
        type: 'Category'
      }));
  }

  get hasSuggestions(): boolean {
    return this.roleLinks.length > 0
      || this.blogSuggestions.length > 0
      || this.userSuggestions.length > 0
      || this.suggestions.length > 0;
  }

  get panelTitle(): string {
    return this.searchQuery.trim() ? 'Results' : 'Quick Access';
  }

  get exploreRoute(): string {
    return this.roleLinks.find(n => n.route.includes('explore'))?.route
      || this.roleLinks.find(n => n.route.includes('manage-blogs'))?.route
      || '/welcome';
  }

  onSearchFocus(): void  { this.showSuggestions = true; }
  onSearchClick(): void  { this.showSuggestions = true; }

  onSearchInput(value: string): void {
    this.searchQuery = value;
    this.showSuggestions = true;
  }

  onSearchEnter(): void {
    if (!this.searchQuery.trim()) return;
    this.showSuggestions = false;
    this.searchChange.emit(this.searchQuery.trim());
  }

  toggleMenu(): void { this.menuOpen = !this.menuOpen; }

  openProfile(e: Event): void {
    e.stopPropagation();
    this.profileOpen = !this.profileOpen;
    this.open.emit();
  }

  @HostListener('document:click', ['$event'])
  onDocClick(e: MouseEvent): void {
    if (!(e.target as HTMLElement).closest('.ch-search')) {
      this.showSuggestions = false;
    }
  }

  @HostListener('document:keydown', ['$event'])
  onKeydown(e: KeyboardEvent): void {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      const el = document.querySelector('.ch-search-input') as HTMLInputElement;
      el?.focus();
    }
    if (e.key === 'Escape') { this.showSuggestions = false; }
  }
}
