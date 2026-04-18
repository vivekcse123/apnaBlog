import { CommonModule } from '@angular/common';
import { Component, DestroyRef, inject, OnInit, signal, computed } from '@angular/core';
import { CommonHeader } from '../../../../shared/common-header/common-header';
import { ActivatedRoute, RouterLink, RouterOutlet } from '@angular/router';
import { UserService } from '../../services/user-service';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { UserProfile } from '../../../../shared/user-profile/user-profile';
import { Auth } from '../../../../core/services/auth';

@Component({
  selector: 'app-user-dashboard',
  standalone: true,
  imports: [CommonModule, CommonHeader, UserProfile, RouterOutlet, RouterLink],
  templateUrl: './user-dashboard.html',
  styleUrl: './user-dashboard.css',
})
export class UserDashboard implements OnInit {
  private route       = inject(ActivatedRoute);
  private userService = inject(UserService);
  private destroyRef  = inject(DestroyRef);
  private authService = inject(Auth);

  userId  = signal<string>('');
  initial = signal<string>('');
  avatar  = signal<string | null>(null);
  user    = signal<any>(null);
  isOpened = signal<boolean>(false);

  // passes avatar URL if exists, otherwise passes initials string
  // CommonHeader will need to handle both cases
  profileDisplay = computed(() => this.avatar() ?? this.initial());

  ngOnInit(): void {
    const id = this.route.snapshot.params['id'];
    this.userId.set(id);

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
        error: (err) => console.error('Failed to load user:', err),
      });
  }

  openProfile():  void { this.isOpened.set(!this.isOpened()); }
  closeProfile(): void { this.isOpened.set(false); }
  logout():       void { this.authService.logout(); }
}