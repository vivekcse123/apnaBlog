import { CommonModule } from '@angular/common';
import { Component, DestroyRef, inject, OnInit, signal, computed, ChangeDetectionStrategy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AdminService } from '../../../admin/services/admin-service';

type Role = 'user' | 'admin' | 'super_admin';

@Component({
  selector: 'app-role-management',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './role-management.html',
  styleUrl: './role-management.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RoleManagement implements OnInit {
  private adminService = inject(AdminService);
  private destroyRef   = inject(DestroyRef);

  users       = signal<any[]>([]);
  filtered    = signal<any[]>([]);
  isLoading   = signal(true);
  searchQuery = '';
  filterRole  = '';
  confirmUser = signal<any | null>(null);
  pendingRole = signal<Role | null>(null);
  isSaving    = signal(false);
  toast       = signal<{ msg: string; type: 'success' | 'error' } | null>(null);

  readonly roles: Role[] = ['user', 'admin', 'super_admin'];

  // ── Pagination ────────────────────────────────────────────────────────────────
  readonly pageSize  = 10;
  currentPage        = signal(1);
  totalPages         = computed(() => Math.max(1, Math.ceil(this.filtered().length / this.pageSize)));
  pagedUsers         = computed(() => {
    const start = (this.currentPage() - 1) * this.pageSize;
    return this.filtered().slice(start, start + this.pageSize);
  });
  pageStart          = computed(() => Math.min((this.currentPage() - 1) * this.pageSize + 1, this.filtered().length));
  pageEnd            = computed(() => Math.min(this.currentPage() * this.pageSize, this.filtered().length));
  pageNumbers        = computed(() => Array.from({ length: this.totalPages() }, (_, i) => i + 1));

  ngOnInit(): void {
    this.adminService.getAllUsersRaw(1, 1000)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.users.set(res.data ?? []);
          this.filtered.set(res.data ?? []);
          this.isLoading.set(false);
        },
        error: () => this.isLoading.set(false),
      });
  }

  applyFilter(): void {
    let list = this.users();
    if (this.searchQuery.trim()) {
      const q = this.searchQuery.toLowerCase();
      list = list.filter(u => u.name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q));
    }
    if (this.filterRole) {
      list = list.filter(u => u.role === this.filterRole);
    }
    this.filtered.set(list);
    this.currentPage.set(1);
  }

  goToPage(page: number): void {
    if (page < 1 || page > this.totalPages()) return;
    this.currentPage.set(page);
  }

  openConfirm(user: any, role: Role): void {
    if (user.role === role) return;
    this.confirmUser.set(user);
    this.pendingRole.set(role);
  }

  cancelConfirm(): void {
    this.confirmUser.set(null);
    this.pendingRole.set(null);
  }

  confirmChange(): void {
    const user = this.confirmUser();
    const role = this.pendingRole();
    if (!user || !role) return;

    this.isSaving.set(true);
    this.adminService.changeUserRole(user._id, role)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          const updated = this.users().map(u =>
            u._id === user._id ? { ...u, role: res.data.role } : u
          );
          this.users.set(updated);
          this.applyFilter();
          this.cancelConfirm();
          this.isSaving.set(false);
          this.showToast(`${user.name}'s role updated to ${role}`, 'success');
        },
        error: () => {
          this.isSaving.set(false);
          this.showToast('Failed to update role. Please try again.', 'error');
        },
      });
  }

  showToast(msg: string, type: 'success' | 'error'): void {
    this.toast.set({ msg, type });
    setTimeout(() => this.toast.set(null), 3500);
  }

  getRoleLabel(role: string): string {
    if (role === 'super_admin') return 'Super Admin';
    return role.charAt(0).toUpperCase() + role.slice(1);
  }

  getInitials(name: string): string {
    const p = name?.trim().split(' ') ?? [];
    return ((p[0]?.charAt(0) ?? '') + (p[1]?.charAt(0) ?? '')).toUpperCase();
  }

  countByRole(role: string): number {
    return this.users().filter(u => u.role === role).length;
  }
}
