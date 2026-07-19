import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal
} from '@angular/core';
import { CommonHeader } from '../../../../shared/common-header/common-header';
import { ActivatedRoute, Router, RouterOutlet } from '@angular/router';
import { UserService } from '../../services/user-service';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { UserProfile } from '../../../../shared/user-profile/user-profile';
import { Auth } from '../../../../core/services/auth';
import { Sidebar, SidebarLink } from '../../../../shared/sidebar/sidebar';
import { MobileBottomNav } from '../../../../shared/mobile-bottom-nav/mobile-bottom-nav';
import { MessageService } from '../../../../core/services/message.service';

@Component({
  selector: 'app-user-dashboard',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, CommonHeader, UserProfile, RouterOutlet, Sidebar, MobileBottomNav],
  templateUrl: './user-dashboard.html',
  styleUrl: './user-dashboard.css',
})
export class UserDashboard implements OnInit {
  private route          = inject(ActivatedRoute);
  private router         = inject(Router);
  private userService    = inject(UserService);
  private destroyRef     = inject(DestroyRef);
  private authService    = inject(Auth);
  private messageService = inject(MessageService);

  userId  = signal<string>('');
  initial = signal<string>('');
  avatar  = signal<string | null>(null);
  user    = signal<any>(null);
  isOpened    = signal<boolean>(false);
  sidebarOpen = signal<boolean>(false);
  unreadMessages = signal<number>(0);

  // passes avatar URL if exists, otherwise passes initials string
  // CommonHeader will need to handle both cases
  profileDisplay = computed(() => this.avatar() ?? this.initial());

  // "Mentor Requests" only shows once we know the user is a mentor (real
  // field on the User model - see blogApp/src/models/users.model.js) - built
  // here rather than inline in the template since Angular template
  // expressions don't support array spread syntax.
  navLinks = computed<SidebarLink[]>(() => {
    const id = this.userId();
    const unread = this.unreadMessages();
    const links: SidebarLink[] = [
      { label: 'Home',         routerLink: '/user/' + id,                         icon: 'home',     exact: true,  groupLabel: 'Content' },
      { label: 'Blogs',        routerLink: '/user/' + id + '/manage-blogs',       icon: 'docs',     exact: false, groupLabel: 'Content' },
      { label: 'My Shorts',    routerLink: '/user/' + id + '/my-shorts',          icon: 'video',    exact: false, groupLabel: 'Content' },
      {
        label: 'Messages', routerLink: '/user/' + id + '/messages', icon: 'mail', exact: false,
        groupLabel: 'Inbox', badge: unread > 0 ? String(unread) : undefined,
      },
      { label: 'Callback Requests', routerLink: '/user/' + id + '/career-guides/callback-requests', icon: 'comment', exact: false, groupLabel: 'Inbox' },
    ];
    if (this.user()?.isMentor) {
      links.push({ label: 'Mentor Requests', routerLink: '/user/' + id + '/career-guides/mentor-requests', icon: 'comment', exact: false, groupLabel: 'Inbox', badge: 'Mentor' });
    }
    links.push(
      { label: 'Shorts Feed',  routerLink: '/shorts',                                   icon: 'video',    exact: true,  groupLabel: 'Discover' },
      { label: 'Bookmarks',    routerLink: '/bookmarks',                                icon: 'bookmark', exact: true,  groupLabel: 'Discover' },
      { label: 'Read Stories', routerLink: '/blog',                              icon: 'search',   exact: false, groupLabel: 'Discover' },
      { label: 'Settings',     routerLink: '/user/' + id + '/settings',           icon: 'settings', exact: false, groupLabel: 'Discover' },
    );
    return links;
  });

  ngOnInit(): void {
    const id = this.route.snapshot.params['id'];
    this.userId.set(id);

    this.messageService.getConversations()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          const total = (res.data ?? []).reduce((sum, c) => sum + (c.unreadCount ?? 0), 0);
          this.unreadMessages.set(total);
        },
        error: () => {},
      });

    this.userService.getUserById(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          const u = res.data;
          this.user.set(u);

          // ── initials ──
          const parts   = u.name?.split(' ') ?? [];
          const first   = parts[0]?.charAt(0) ?? '';
          const second  = parts[1]?.charAt(0) ?? '';
          this.initial.set((first + second).toUpperCase());

          // ── avatar ──
          this.avatar.set(u.avatar ?? null);
        },
        error: () => {},
      });
  }

  openProfile():  void { this.isOpened.set(!this.isOpened()); }
  closeProfile(): void { this.isOpened.set(false); }
  toggleSidebar(): void { this.sidebarOpen.update(v => !v); }
  logout():       void { this.authService.logout(); }

  onSearch(query: string): void {
    if (!query.trim()) return;
    this.router.navigate(['/blog'], {
      queryParams: { q: query.trim() }
    });
  }
}