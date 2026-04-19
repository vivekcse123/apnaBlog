import { Component, computed, inject, OnInit, DestroyRef, signal, ChangeDetectionStrategy } from '@angular/core';
import { AdminService } from '../../services/admin-service';
import { User } from '../../../user/models/user.mode';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs';
import { ViewUser } from '../../../../shared/view-user/view-user';
import { DisabledDirective } from '../../../../shared/directives/highlight';
import { CreateUser } from '../create-user/create-user';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NotificationNavEvent, NotificationNavigationService, USER_NOTIFICATION_TYPES } from '../../../../core/services/open-notification/notification-navigation';
import { Auth } from '../../../../core/services/auth';
import { ToastService } from '../../../../core/services/toast.service';

@Component({
  selector: 'app-manage-users',
  standalone: true,
  imports: [CommonModule, FormsModule, ViewUser, DisabledDirective, CreateUser],
  templateUrl: './manage-users.html',
  styleUrls: ['./manage-users.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ManageUsers implements OnInit {
  private adminService = inject(AdminService);
  private route        = inject(ActivatedRoute);
  private destroyRef   = inject(DestroyRef);
  private navSvc       = inject(NotificationNavigationService);
  private authService  = inject(Auth);
  private toastService = inject(ToastService);

  allUsers  = signal<User[]>([]);
  isLoading = signal(true);

  readonly skeletonRows = Array(6).fill(null);

  currentPage = signal(1);
  limit       = signal(6);

  searchName     = '';
  debounceValue  = signal('');
  selectedRole   = signal('');
  selectedStatus = signal('');
  private timer: any;

  filteredUsers = computed(() => {
    let data = this.allUsers();
    if (this.debounceValue()) {
      const s = this.debounceValue().toLowerCase();
      data = data.filter(u => u.name.toLowerCase().includes(s));
    }
    if (this.selectedRole())   data = data.filter(u => u.role   === this.selectedRole());
    if (this.selectedStatus()) data = data.filter(u => u.status === this.selectedStatus());
    return data;
  });

  paginatedUsers = computed(() => {
    const start = (this.currentPage() - 1) * this.limit();
    return this.filteredUsers().slice(start, start + this.limit());
  });

  totalPages = computed(() => Math.ceil(this.filteredUsers().length / this.limit()));
  pages      = computed(() => Array.from({ length: this.totalPages() }, (_, i) => i + 1));

  isProfileOpened  = signal(false);
  selectedUserId   = signal<string>('');
  showCreateModal  = signal(false);
  showConfirm      = signal(false);
  pendingUser      = signal<any>(null);
  showDeleteConfirm  = signal(false);
  pendingDeleteUser  = signal<any>(null);
  userId       = signal<string>('');

ngOnInit(): void {
  this.route.parent?.paramMap
    .pipe(takeUntilDestroyed(this.destroyRef))
    .subscribe(params => {
      this.userId.set(params.get('id') ?? '');
      this.loadUsers();
    });

  // ✅ Replaces consumePendingEvent
  this.navSvc.openModal$
    .pipe(takeUntilDestroyed(this.destroyRef))
    .subscribe((event: NotificationNavEvent) => {
      if (USER_NOTIFICATION_TYPES.includes(event.type) && event.resourceId) {
        this.getUserDetails(event.resourceId);
      }
    });
}

loadUsers(): void {
  const loader = this.authService.isSuperAdmin()
    ? this.adminService.getAllUsersRaw(1, 1000)
    : this.adminService.getAllUsers(1, 100);

  this.isLoading.set(true);

  loader.pipe(
    takeUntilDestroyed(this.destroyRef),
    finalize(() => this.isLoading.set(false))
  ).subscribe({
    next:  res => this.allUsers.set(res.data || []),
    error: err => console.error(err?.error?.message),
  });
}

  debounceSearch(value: string): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => { this.debounceValue.set(value); this.currentPage.set(1); }, 300);
  }

  goToPage(p: number): void { if (p >= 1 && p <= this.totalPages()) this.currentPage.set(p); }
  previousPage():      void { if (this.currentPage() > 1) this.currentPage.set(this.currentPage() - 1); }
  nextPage():          void { if (this.currentPage() < this.totalPages()) this.currentPage.set(this.currentPage() + 1); }

  getUserDetails(userId: string): void {
    this.selectedUserId.set(userId);
    this.isProfileOpened.set(true);
  }

  closeProfile(): void {
    this.isProfileOpened.set(false);
    this.selectedUserId.set('');
  }

  onUserUpdated(updatedUser: any): void {
    this.allUsers.update(list => list.map(u => u._id === updatedUser._id ? updatedUser : u));
    this.closeProfile();
  }

  toggleUserStatus(user: any): void { this.pendingUser.set(user); this.showConfirm.set(true); }

  confirmToggle(): void {
    const user = this.pendingUser();
    if (!user) return;
    this.showConfirm.set(false);

    const isActive = user.status === 'active';
    const req = isActive
      ? this.adminService.freezeUser(user._id)
      : this.adminService.unFreezeUser(user._id);

    req.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        user.status = isActive ? 'inactive' : 'active';
        this.toastService.show(
          isActive ? `${user.name} has been frozen.` : `${user.name} has been unfrozen.`,
          'success'
        );
        this.pendingUser.set(null);
      },
      error: err => {
        this.toastService.show(err?.error?.message || 'Something went wrong.', 'error');
        this.pendingUser.set(null);
      },
    });
  }

  cancelToggle(): void { this.showConfirm.set(false); this.pendingUser.set(null); }

  deleteUser(user: any): void { this.pendingDeleteUser.set(user); this.showDeleteConfirm.set(true); }

  confirmDelete(): void {
    const user = this.pendingDeleteUser();
    if (!user) return;
    this.showDeleteConfirm.set(false);

    this.adminService.deleteUser(user._id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.allUsers.update(list => list.filter(u => u._id !== user._id));
          this.toastService.show(`${user.name} has been deleted successfully.`, 'success');
          this.pendingDeleteUser.set(null);
        },
        error: err => {
          this.toastService.show(err?.error?.message || 'Something went wrong.', 'error');
          this.pendingDeleteUser.set(null);
        },
      });
  }

  cancelDelete(): void { this.showDeleteConfirm.set(false); this.pendingDeleteUser.set(null); }
}