import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy, Component, OnDestroy, OnInit, computed, effect, inject, signal
} from '@angular/core';
import { Auth } from '../../../../core/services/auth';
import { ActivatedRoute, Router, RouterOutlet } from '@angular/router';
import { UserService } from '../../../user/services/user-service';
import { Subscription, switchMap } from 'rxjs';
import { CommonHeader } from "../../../../shared/common-header/common-header";
import { UserProfile } from "../../../../shared/user-profile/user-profile";
import { User } from '../../../user/models/user.mode';
import { Sidebar } from '../../../../shared/sidebar/sidebar';
import { MobileBottomNav } from '../../../../shared/mobile-bottom-nav/mobile-bottom-nav';
import { AdminMessagesService } from '../../services/admin-messages.service';
import { hasLifetimeAccess } from '../../../../core/utils/lifetime-membership.util';

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterOutlet, CommonHeader, UserProfile, Sidebar, MobileBottomNav],
  templateUrl: './admin-dashboard.html',
  styleUrl: './admin-dashboard.css',
})
export class AdminDashboard implements OnInit, OnDestroy{
  protected readonly hasLifetimeAccess = hasLifetimeAccess;

  private route = inject(ActivatedRoute);
  private userService = inject(UserService);
  private authService = inject(Auth);
  private router = inject(Router);
  private adminMessages = inject(AdminMessagesService);

  initial = signal<string | null>(null);
  avatar  = signal<string | null>(null);
  userId  = signal<string | null>(null);

  /** Sidebar "Messages" nav-link badge - unread contact + DM count. */
  messagesBadge = computed(() => {
    const n = this.adminMessages.unreadContactCount() + this.adminMessages.unreadMessageCount();
    return n > 0 ? String(n) : undefined;
  });

  user = signal<User | any>('');
  sub!: Subscription;

  constructor() {
    // Seed the sidebar "Messages" badge counts on every admin session, and
    // reseed whenever a new contact/DM arrives (liveTick) - so the badge
    // stays current without the admin needing to open the Messages page.
    effect(() => {
      this.adminMessages.liveTick();
      this.adminMessages.listContacts({ limit: 1 }).subscribe();
      this.adminMessages.listConversations({ limit: 1 }).subscribe();
    });
  }

  ngOnInit(): void {
    this.adminMessages.ensureLive();

    this.sub = this.route.paramMap.pipe(
      switchMap(param =>{
        const id = param.get('id');
        this.userId.set(id);
        return this.userService.getUserById(id);
       
      })
    ).subscribe({
      next: (user) =>{
        if(!user){
          this.router.navigate(['/page-not-found']);
          return;
        }
        const name = user.data.name;
        const parts = name.trim().split(' ');
        const first  = parts[0]?.charAt(0).toUpperCase() ?? '';
        const second = parts[1]?.charAt(0).toUpperCase() ?? '';
        this.initial.set(first + second);

        this.avatar.set(user.data.avatar ?? null);
        this.user.set(user.data);
      },
      error: (err) => {
        this.router.navigate(['/page-not-found']);
        return;
      }
    })
  }

  isOpened    = signal(false);
  sidebarOpen = signal(false);
  openProfile():  void { this.isOpened.set(!this.isOpened()); }
  toggleSidebar(): void { this.sidebarOpen.update(v => !v); }

  closeProfile(){
    this.isOpened.set(false);
  }

  logout(): void { this.authService.logout(); }

  onSearch(query: string): void {
    if (!query.trim()) return;
    this.router.navigate(['/admin', this.userId(), 'manage-blogs'], {
      queryParams: { q: query.trim() }
    });
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
  }
}
