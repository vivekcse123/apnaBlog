import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy, Component, OnDestroy, OnInit, computed, effect, inject, signal
} from '@angular/core';
import { Auth } from '../../../../core/services/auth';
import { ActivatedRoute, Router, RouterOutlet } from '@angular/router';
import { UserService } from '../../../user/services/user-service';
import { Subscription, switchMap } from 'rxjs';
import { CommonHeader } from '../../../../shared/common-header/common-header';
import { UserProfile } from '../../../../shared/user-profile/user-profile';
import { User } from '../../../user/models/user.mode';
import { Sidebar } from '../../../../shared/sidebar/sidebar';
import { MobileBottomNav } from '../../../../shared/mobile-bottom-nav/mobile-bottom-nav';
import { AdminMessagesService } from '../../../admin/services/admin-messages.service';
import { hasLifetimeAccess } from '../../../../core/utils/lifetime-membership.util';

@Component({
  selector: 'app-super-admin-dashboard',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterOutlet, CommonHeader, UserProfile, Sidebar, MobileBottomNav],
  templateUrl: './super-admin-dashboard.html',
  styleUrl: './super-admin-dashboard.css',
})
export class SuperAdminDashboard implements OnInit, OnDestroy {
  protected readonly hasLifetimeAccess = hasLifetimeAccess;

  private route       = inject(ActivatedRoute);
  private userService = inject(UserService);
  private authService = inject(Auth);
  private router      = inject(Router);
  private adminMessages = inject(AdminMessagesService);

  initial  = signal<string | null>(null);
  avatar   = signal<string | null>(null);
  userId   = signal<string | null>(null);
  user        = signal<User | any>('');
  isOpened    = signal(false);
  sidebarOpen = signal(false);

  /** Sidebar "Messages" nav-link badge - unread contact + DM count. */
  messagesBadge = computed(() => {
    const n = this.adminMessages.unreadContactCount() + this.adminMessages.unreadMessageCount();
    return n > 0 ? String(n) : undefined;
  });

  sub!: Subscription;

  constructor() {
    effect(() => {
      this.adminMessages.liveTick();
      this.adminMessages.listContacts({ limit: 1 }).subscribe();
      this.adminMessages.listConversations({ limit: 1 }).subscribe();
    });
  }

  ngOnInit(): void {
    this.adminMessages.ensureLive();
    this.sub = this.route.paramMap.pipe(
      switchMap(param => {
        const id = param.get('id');
        this.userId.set(id);
        return this.userService.getUserById(id);
      })
    ).subscribe({
      next: (user) => {
        if (!user) { this.router.navigate(['/page-not-found']); return; }
        const name  = user.data.name;
        const parts = name.trim().split(' ');
        this.initial.set(
          (parts[0]?.charAt(0).toUpperCase() ?? '') +
          (parts[1]?.charAt(0).toUpperCase() ?? '')
        );
        this.avatar.set(user.data.avatar ?? null);
        this.user.set(user.data);
      },
      error: () => this.router.navigate(['/page-not-found'])
    });
  }

  openProfile():   void { this.isOpened.set(!this.isOpened()); }
  closeProfile():  void { this.isOpened.set(false); }
  logout():        void { this.authService.logout(); }
  toggleSidebar(): void { this.sidebarOpen.update(v => !v); }

  ngOnDestroy(): void { this.sub.unsubscribe(); }
}
