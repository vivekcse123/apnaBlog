import { Component, computed, inject, OnInit, DestroyRef, signal } from '@angular/core';
import { AdminService } from '../../services/admin-service';
import { User } from '../../../user/models/user.mode';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ViewUser } from '../../../../shared/view-user/view-user';
import { MessageModal } from '../../../../shared/message-modal/message-modal';
import { DisabledDirective } from '../../../../shared/directives/highlight';
import { CreateUser } from '../create-user/create-user';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

@Component({
  selector: 'app-manage-users',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ViewUser,
    MessageModal,
    DisabledDirective,
    CreateUser
  ],
  templateUrl: './manage-users.html',
  styleUrls: ['./manage-users.css'],
})
export class ManageUsers implements OnInit {
  private adminService = inject(AdminService);
  private route = inject(ActivatedRoute);
  private destroyRef = inject(DestroyRef);

  allUsers = signal<User[]>([]);

  currentPage = signal(1);
  limit = signal(6);

  searchName = '';
  debounceValue = signal('');
  selectedRole = signal('');
  selectedStatus = signal('');

  private timer: any;

  filteredUsers = computed(() => {
    let data = this.allUsers();

    if (this.debounceValue()) {
      const search = this.debounceValue().toLowerCase();
      data = data.filter(user =>
        user.name.toLowerCase().includes(search)
      );
    }

    if (this.selectedRole()) {
      data = data.filter(user => user.role === this.selectedRole());
    }

    if (this.selectedStatus()) {
      data = data.filter(user => user.status === this.selectedStatus());
    }

    return data;
  });

  paginatedUsers = computed(() => {
    const start = (this.currentPage() - 1) * this.limit();
    const end = start + this.limit();
    return this.filteredUsers().slice(start, end);
  });

  totalPages = computed(() =>
    Math.ceil(this.filteredUsers().length / this.limit())
  );

  pages = computed(() =>
    Array.from({ length: this.totalPages() }, (_, i) => i + 1)
  );

  isProfileOpened = signal(false);
  selectedUserId = signal<string>('');
  successMessage = signal<string>('');

  showCreateModal = signal(false);

  showConfirm = signal(false);
  pendingUser = signal<any>(null);

  showMessage = signal(false);
  modalType = signal<'success' | 'error'>('success');
  modalTitle = signal('');
  modalMessage = signal('');

  userId = signal<string>('');

  ngOnInit(): void {
    this.route.parent?.paramMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((params) => {
        this.userId.set(params.get('id') ?? '');
        this.loadUsers();
      });
  }

  loadUsers(): void {
    this.adminService
      .getAllUsers(1, 10)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.allUsers.set(res.data || []);
        },
        error: (err) => console.error(err?.error?.message),
      });
  }

  debounceSearch(value: string): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.debounceValue.set(value);
      this.currentPage.set(1); 
    }, 300);
  }

  goToPage(page: number): void {
    if (page >= 1 && page <= this.totalPages()) {
      this.currentPage.set(page);
    }
  }

  previousPage(): void {
    if (this.currentPage() > 1) {
      this.currentPage.set(this.currentPage() - 1);
    }
  }

  nextPage(): void {
    if (this.currentPage() < this.totalPages()) {
      this.currentPage.set(this.currentPage() + 1);
    }
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
    this.allUsers.update((list) =>
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
    const request = isActive
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