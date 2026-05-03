import { CommonModule } from '@angular/common';
import { Component, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { Auth } from '../../../../core/services/auth';
import { ActivatedRoute, Router, RouterOutlet } from '@angular/router';
import { UserService } from '../../../user/services/user-service';
import { Subscription, switchMap } from 'rxjs';
import { CommonHeader } from '../../../../shared/common-header/common-header';
import { UserProfile } from '../../../../shared/user-profile/user-profile';
import { User } from '../../../user/models/user.mode';
import { Sidebar } from '../../../../shared/sidebar/sidebar';

@Component({
  selector: 'app-super-admin-dashboard',
  standalone: true,
  imports: [CommonModule, RouterOutlet, CommonHeader, UserProfile, Sidebar],
  templateUrl: './super-admin-dashboard.html',
  styleUrl: './super-admin-dashboard.css',
})
export class SuperAdminDashboard implements OnInit, OnDestroy {
  private route       = inject(ActivatedRoute);
  private userService = inject(UserService);
  private authService = inject(Auth);
  private router      = inject(Router);

  initial  = signal<string | null>(null);
  avatar   = signal<string | null>(null);
  userId   = signal<string | null>(null);
  user        = signal<User | any>('');
  isOpened    = signal(false);
  sidebarOpen = signal(false);

  sub!: Subscription;

  ngOnInit(): void {
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
