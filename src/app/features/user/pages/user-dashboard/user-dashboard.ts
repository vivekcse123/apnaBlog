import { CommonModule } from '@angular/common';
import { Component, DestroyRef, inject, OnInit, signal } from '@angular/core';
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
export class UserDashboard implements OnInit{
  private route = inject(ActivatedRoute);
  private userService = inject(UserService);
  private destroyRef = inject(DestroyRef);
  private authService = inject(Auth);

  userId = signal<string>('');
  initial = signal<string>('');
  user = signal<any>([]);
  isOpened = signal<boolean>(false);

  ngOnInit(): void {
    const id = this.route.snapshot.params['id'];
    this.userId.set(id);

    this.userService.getUserById(id).
    pipe(takeUntilDestroyed(this.destroyRef))
    .subscribe({
      next: (user) =>{
        this.user.set(user.data);
        const name = user.data.name;
        const chars = name.charAt(0) + name.slice(1).charAt(0);
        this.initial.set(chars.toUpperCase());
      },
      error(err){
        console.log(err);
      }
    })

  }

  openProfile(){
    this.isOpened.set(true);
  }

  closeProfile(){
    this.isOpened.set(false);
  }

  logout(){
    this.authService.logout();
  }
}
