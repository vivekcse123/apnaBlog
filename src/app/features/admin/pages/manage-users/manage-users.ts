import { Component, computed, inject, OnInit, DestroyRef, signal } from '@angular/core';
import { AdminService } from '../../services/admin-service';
import { User } from '../../../user/models/user.mode';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { FilterByNamePipe } from '../../../../shared/pipes/filter-by-name-pipe';
import { FormsModule } from '@angular/forms';
import { ViewUser } from '../../../../shared/view-user/view-user';
import { FilterByRolePipe } from '../../../../shared/pipes/filter-by-role-pipe';
import { MessageModal } from '../../../../shared/message-modal/message-modal';
import { DisabledDirective } from '../../../../shared/directives/highlight';
import { CreateUser } from '../create-user/create-user';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FilterByStatusPipe } from '../../../../shared/pipes/filter-by-status-pipe';

@Component({
  selector: 'app-manage-users',
  standalone: true,
  imports: [
    CommonModule,
    FilterByNamePipe,
    FormsModule,
    ViewUser,
    FilterByRolePipe,
    FilterByStatusPipe,
    MessageModal,
    DisabledDirective,
    CreateUser,
  ],
  templateUrl: './manage-users.html',
  styleUrls: ['./manage-users.css'],
})
export class ManageUsers implements OnInit {
  private adminService = inject(AdminService);
  private route        = inject(ActivatedRoute);
  private destroyRef   = inject(DestroyRef);

  users      = signal<User[]>([]);
  totalUsers = signal<number>(0);
  userId     = signal<string>('');

  currentPage = signal(1);
  limit       = signal(5);
  totalPages  = signal(1);

  pages = computed(() =>
    Array.from({ length: this.totalPages() }, (_, i) => i + 1)
  );

  searchName     = '';
  selectedRole   = signal('');
  selectedStatus = signal('');
  debounceValue  = signal('');
  private timer: any;

  isProfileOpened = signal(false);
  selectedUserId  = signal<string>('');
  successMessage  = signal<string>('');

  showCreateModal = signal(false);

  showConfirm = signal(false);
  pendingUser = signal<any>(null);

  showMessage  = signal(false);
  modalType    = signal<'success' | 'error'>('success');
  modalTitle   = signal('');
  modalMessage = signal('');

  ngOnInit(): void {
    this.route.parent?.paramMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((params) => {
        this.userId.set(params.get('id') ?? '');
        this.loadUsers();
      });
  }

  debounceSearch(value: string): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.debounceValue.set(value), 300);
  }

  loadUsers(page: number = this.currentPage()): void {
    this.adminService
      .getAllUsers(page, this.limit())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.totalUsers.set(res?.total ?? 0);
          this.users.set(res.data);
          this.currentPage.set(Number(res.page));
          this.limit.set(Number(res.limit));
          this.totalPages.set(Number(res.totalPages));
        },
        error: (err) => console.error(err?.error?.message),
      });
  }

  goToPage(page: number): void {
    if (page >= 1 && page <= this.totalPages()) this.loadUsers(page);
  }

  previousPage(): void {
    if (this.currentPage() > 1) this.loadUsers(this.currentPage() - 1);
  }

  nextPage(): void {
    if (this.currentPage() < this.totalPages()) this.loadUsers(this.currentPage() + 1);
  }

  getUserDetails(userId: string): void {
    this.successMessage.set('');
    this.selectedUserId.set(userId);
    this.isProfileOpened.set(true);
  }

  closeProfile(): void {
    this.isProfileOpened.set(false);
    this.selectedUserId.set('');
  }

  onUserUpdated(updatedUser: any): void {
    this.users.update((list) =>
      list.map((u) => (u._id === updatedUser._id ? updatedUser : u))
    );
    this.successMessage.set('User updated successfully!');
    setTimeout(() => this.closeProfile(), 1000);
  }

  toggleUserStatus(user: any): void {
    this.pendingUser.set(user);
    this.showConfirm.set(true);
  }

  confirmToggle(): void {
    const user = this.pendingUser();
    if (!user) return;

    this.showConfirm.set(false);

    const isActive = user.status === 'active';
    const request  = isActive
      ? this.adminService.freezeUser(user._id)
      : this.adminService.unFreezeUser(user._id);

    request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        user.status = isActive ? 'inactive' : 'active';
        this.modalType.set('success');
        this.modalTitle.set(isActive ? 'User Frozen' : 'User Unfrozen');
        this.modalMessage.set(
          isActive
            ? `${user.name} has been frozen successfully.`
            : `${user.name} has been unfrozen successfully.`
        );
        this.showMessage.set(true);
        this.pendingUser.set(null);
      },
      error: (err) => {
        this.modalType.set('error');
        this.modalTitle.set('Action Failed');
        this.modalMessage.set(err.message || 'Something went wrong.');
        this.showMessage.set(true);
        this.pendingUser.set(null);
      },
    });
  }

  cancelToggle(): void {
    this.showConfirm.set(false);
    this.pendingUser.set(null);
  }
}