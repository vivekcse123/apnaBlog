import { CommonModule } from '@angular/common';
import { Component, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { Auth } from '../../../../core/services/auth';
import { ActivatedRoute, Router, RouterOutlet } from '@angular/router';
import { UserService } from '../../../user/services/user-service';
import { Subscription, switchMap } from 'rxjs';
import { CommonHeader } from "../../../../shared/common-header/common-header";
import { UserProfile } from "../../../../shared/user-profile/user-profile";
import { User } from '../../../user/models/user.mode';
import { Sidebar } from '../../../../shared/sidebar/sidebar';

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [CommonModule, RouterOutlet, CommonHeader, UserProfile, Sidebar],
  templateUrl: './admin-dashboard.html',
  styleUrl: './admin-dashboard.css',
})
export class AdminDashboard implements OnInit, OnDestroy{
  private route = inject(ActivatedRoute);
  private userService = inject(UserService);
  private authService = inject(Auth);
  private router = inject(Router);

  initial = signal<string | null>(null);
  avatar  = signal<string | null>(null);
  userId  = signal<string | null>(null);

  user = signal<User | any>('');
  sub!: Subscription;

  ngOnInit(): void {
    

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
