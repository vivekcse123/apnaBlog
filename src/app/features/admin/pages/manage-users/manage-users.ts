import { Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { AdminService } from '../../services/admin-service';
import { User } from '../../../user/models/user.mode';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { FilterByNamePipe } from '../../../../shared/pipes/filter-by-name-pipe';
import { FormsModule } from '@angular/forms';
import { ViewUser } from '../../../../shared/view-user/view-user';
import { Subject, takeUntil } from 'rxjs';
import { FilterByRolePipe } from '../../../../shared/pipes/filter-by-role-pipe';
import { MessageModal } from '../../../../shared/message-modal/message-modal';
import { DisabledDirective } from '../../../../shared/directives/highlight';
import { CreateUser } from '../create-user/create-user';

@Component({
  selector: 'app-manage-users',
  standalone: true,
  imports: [
    CommonModule,
    FilterByNamePipe,
    FormsModule,
    ViewUser,
    FilterByRolePipe,
    MessageModal,
    DisabledDirective,
    CreateUser
  ],
  templateUrl: './manage-users.html',
  styleUrls: ['./manage-users.css']
})
export class ManageUsers implements OnInit, OnDestroy {
  private adminService = inject(AdminService);
  private route = inject(ActivatedRoute);

  // ── Data ──────────────────────────────────────────────
  users        = signal<User[]>([]);
  totalUsers   = signal<number>(0);
  currentPage  = signal(1);
  limit        = signal(5);
  totalPages   = signal(1);
  userId       = signal<string>('');
  destroy$     = new Subject<void>();

  // ── Search / Filter ───────────────────────────────────
  searchName    = '';
  selectedRole  = signal('');
  debounceValue = signal('');
  private timer: any;

  // ── Pagination ────────────────────────────────────────
  pages = computed(() =>
    Array.from({ length: this.totalPages() }, (_, i) => i + 1)
  );

  // ── Profile modal ─────────────────────────────────────
  isProfileOpened = signal(false);
  selectedUserId  = signal<string>('');

  // ── Create user modal ─────────────────────────────────
  showCreateModal = signal(false);

  // ── Confirm modal (freeze/unfreeze) ───────────────────
  showConfirm = signal(false);
  pendingUser = signal<any>(null);

  // ── Result modal ──────────────────────────────────────
  showMessage  = signal(false);
  modalType    = signal<'success' | 'error'>('success');
  modalTitle   = signal('');
  modalMessage = signal('');

  // ─────────────────────────────────────────────────────
  ngOnInit(): void {
    this.route.parent?.paramMap
      .pipe(takeUntil(this.destroy$))
      .subscribe(params => {
        this.userId.set(params.get('id') ?? '');
      });
    this.loadUsers();
  }

  // ── Search ────────────────────────────────────────────
  debounceSearch(value: string) {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.debounceValue.set(value), 300);
  }

  // ── Load users ────────────────────────────────────────
  loadUsers(page: number = this.currentPage()) {
    this.adminService.getAllUsers(page, this.limit())
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          this.totalUsers.set(res?.total ?? 0);
          this.users.set(res.data);
          this.currentPage.set(Number(res.page));
          this.limit.set(Number(res.limit));
          this.totalPages.set(Number(res.totalPages));
        },
        error: (err) => console.error(err)
      });
  }

  // ── Pagination ────────────────────────────────────────
  goToPage(page: number) {
    if (page >= 1 && page <= this.totalPages()) this.loadUsers(page);
  }

  previousPage() {
    if (this.currentPage() > 1) this.loadUsers(this.currentPage() - 1);
  }

  nextPage() {
    if (this.currentPage() < this.totalPages()) this.loadUsers(this.currentPage() + 1);
  }

  // ── Profile ───────────────────────────────────────────
  getUserDetails(userId: string) {
    this.selectedUserId.set(userId);
    this.isProfileOpened.set(true);
  }

  closeProfile() {
    this.isProfileOpened.set(false);
  }

  // ── Freeze / Unfreeze ─────────────────────────────────
  toggleUserStatus(user: any) {
    this.pendingUser.set(user);
    this.showConfirm.set(true);
  }

  confirmToggle() {
    const user = this.pendingUser();
    if (!user) return;

    this.showConfirm.set(false);

    const isActive = user.status === 'active';
    const request  = isActive
      ? this.adminService.freezeUser(user._id)
      : this.adminService.unFreezeUser(user._id);

    request.pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        // reflect change immediately in the table
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
      }
    });
  }

  cancelToggle() {
    this.showConfirm.set(false);
    this.pendingUser.set(null);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}