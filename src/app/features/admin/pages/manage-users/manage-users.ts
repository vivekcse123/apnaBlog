import { Component, computed, inject, OnInit, OnDestroy, DestroyRef, signal, ChangeDetectionStrategy } from '@angular/core';
import { AdminService } from '../../services/admin-service';
import { User } from '../../../user/models/user.mode';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs';
import { ViewUser } from '../../../../shared/view-user/view-user';
import { CreateUser } from '../create-user/create-user';
import { CreateSponsor } from '../create-sponsor/create-sponsor';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NotificationNavEvent, NotificationNavigationService, USER_NOTIFICATION_TYPES } from '../../../../core/services/open-notification/notification-navigation';
import { Auth } from '../../../../core/services/auth';
import { ToastService } from '../../../../core/services/toast.service';
import { DashboardCache } from '../../../../core/services/dashboard-cache';
import { hasLifetimeAccess } from '../../../../core/utils/lifetime-membership.util';

type BulkAction = 'freeze' | 'unfreeze' | 'grant-premium' | 'revoke-premium' | 'delete';

@Component({
  selector: 'app-manage-users',
  standalone: true,
  imports: [CommonModule, FormsModule, ViewUser, CreateUser, CreateSponsor],
  templateUrl: './manage-users.html',
  styleUrls: ['./manage-users.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ManageUsers implements OnInit, OnDestroy {
  private adminService   = inject(AdminService);
  private route          = inject(ActivatedRoute);
  private destroyRef     = inject(DestroyRef);
  private navSvc         = inject(NotificationNavigationService);
  private authService    = inject(Auth);
  private toastService   = inject(ToastService);
  private dashboardCache = inject(DashboardCache);

  allUsers  = signal<User[]>([]);
  isLoading = signal(true);

  readonly skeletonRows = Array(6).fill(null);

  currentPage = signal(1);
  limit       = signal(6);

  searchName     = '';
  debounceValue  = signal('');
  selectedRole   = signal('');
  selectedStatus = signal('');
  showTodayOnly  = signal(false);
  private timer: any;

  activeCount   = computed(() => this.allUsers().filter(u => u.status === 'active').length);
  inactiveCount = computed(() => this.allUsers().filter(u => u.status !== 'active').length);
  premiumCount  = computed(() => this.allUsers().filter(u => u.isPremium).length);
  lifetimeCount = computed(() => this.allUsers().filter(u => hasLifetimeAccess(u)).length);
  sponsorCount  = computed(() => this.allUsers().filter(u => u.role === 'sponsor').length);

  protected readonly hasLifetimeAccess = hasLifetimeAccess;

  todayCount = computed(() => {
    const today = new Date();
    return this.allUsers().filter(u => {
      const d = new Date(u.createdAt);
      return d.getFullYear() === today.getFullYear() &&
             d.getMonth()    === today.getMonth()    &&
             d.getDate()     === today.getDate();
    }).length;
  });

  filteredUsers = computed(() => {
    let data = this.allUsers();
    if (this.showTodayOnly()) {
      const today = new Date();
      data = data.filter(u => {
        const d = new Date(u.createdAt);
        return d.getFullYear() === today.getFullYear() &&
               d.getMonth()    === today.getMonth()    &&
               d.getDate()     === today.getDate();
      });
    }
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

  totalPages = computed(() => Math.max(1, Math.ceil(this.filteredUsers().length / this.limit())));
  pages      = computed(() => Array.from({ length: this.totalPages() }, (_, i) => i + 1));
  pageStart  = computed(() => Math.min((this.currentPage() - 1) * this.limit() + 1, this.filteredUsers().length));
  pageEnd    = computed(() => Math.min(this.currentPage() * this.limit(), this.filteredUsers().length));

  isProfileOpened  = signal(false);
  selectedUserId   = signal<string>('');
  selectedUserObj  = signal<any>(null);
  showCreateModal        = signal(false);
  showCreateSponsorModal = signal(false);
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

    this.navSvc.openModal$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((event: NotificationNavEvent) => {
        if (USER_NOTIFICATION_TYPES.includes(event.type) && event.resourceId) {
          this.getUserDetails(event.resourceId);
        }
      });

    // Re-fetch when the browser tab regains focus and data is stale
    document.addEventListener('visibilitychange', this._onVisibilityChange);
  }

  // Arrow fn so `this` is stable as event listener reference
  private readonly _onVisibilityChange = (): void => {
    if (document.hidden) return;
    const isSuperAdmin = this.authService.isSuperAdmin();
    const stale = isSuperAdmin
      ? this.dashboardCache.isRawUsersStale()
      : this.dashboardCache.isAdminUsersStale();
    if (stale) this.loadUsers();
  };

  loadUsers(): void {
    const isSuperAdmin = this.authService.isSuperAdmin();

    // ── Fast path: serve from independent cache slot ────────────────────────
    if (isSuperAdmin) {
      const cached = this.dashboardCache.getRawUsers();
      if (cached) {
        this.allUsers.set(cached);
        this.isLoading.set(false);
        if (this.dashboardCache.isRawUsersStale()) this._fetchRawUsers();
        return;
      }
    } else {
      const cached = this.dashboardCache.getAdminUsers();
      if (cached) {
        this.allUsers.set(cached as User[]);
        this.isLoading.set(false);
        if (this.dashboardCache.isAdminUsersStale()) this._fetchUsers();
        return;
      }
    }

    // ── Cold path ───────────────────────────────────────────────────────────
    this.isLoading.set(true);
    if (isSuperAdmin) this._fetchRawUsers(true);
    else this._fetchUsers(true);
  }

  private _fetchRawUsers(showLoader = false): void {
    if (showLoader) this.isLoading.set(true);
    this.adminService.getAllUsersRaw(1, 1000)
      .pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.isLoading.set(false)))
      .subscribe({
        next: res => {
          const users = res.data || [];
          this.allUsers.set(users);
          this.dashboardCache.setRawUsers(users);   // ← only writes its own slot
        },
        error: () => {},
      });
  }

  private _fetchUsers(showLoader = false): void {
    if (showLoader) this.isLoading.set(true);
    this.adminService.getAllUsers(1, 1000)
      .pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.isLoading.set(false)))
      .subscribe({
        next: res => {
          const users = res.data || [];
          this.allUsers.set(users);
          this.dashboardCache.setAdminUsers(users);  // ← only writes its own slot
        },
        error: () => {},
      });
  }

  toggleTodayFilter(): void { this.showTodayOnly.update(v => !v); this.currentPage.set(1); }

  debounceSearch(value: string): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => { this.debounceValue.set(value); this.currentPage.set(1); }, 300);
  }

  goToPage(p: number): void { if (p >= 1 && p <= this.totalPages()) this.currentPage.set(p); }
  previousPage():      void { if (this.currentPage() > 1) this.currentPage.set(this.currentPage() - 1); }
  nextPage():          void { if (this.currentPage() < this.totalPages()) this.currentPage.set(this.currentPage() + 1); }

  getUserDetails(userId: string): void {
    // Pass the full object from the list so the modal renders instantly
    const fromList = this.allUsers().find(u => u._id === userId) ?? null;
    this.selectedUserObj.set(fromList);
    this.selectedUserId.set(userId);
    this.isProfileOpened.set(true);
  }

  closeProfile(): void {
    this.isProfileOpened.set(false);
    this.selectedUserId.set('');
    this.selectedUserObj.set(null);
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
        this.allUsers.update(users => [...users]);
        this.toastService.show(
          isActive ? `${user.name} has been frozen.` : `${user.name} has been unfrozen.`,
          'success'
        );
        this.dashboardCache.invalidateAdminUsers();
        this.dashboardCache.invalidateRawUsers();
        this.pendingUser.set(null);
      },
      error: err => {
        this.toastService.show(err?.error?.message || 'Something went wrong.', 'error');
        this.pendingUser.set(null);
      },
    });
  }

  cancelToggle(): void { this.showConfirm.set(false); this.pendingUser.set(null); }

  // Lower-stakes than freeze (no loss of account access), so this is a
  // direct toggle + toast rather than a confirm dialog.
  togglePremium(user: any): void {
    const nextValue = !user.isPremium;
    this.adminService.setPremium(user._id, nextValue)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          user.isPremium = nextValue;
          this.allUsers.update(users => [...users]);
          this.toastService.show(
            nextValue ? `Premium granted to ${user.name}.` : `Premium revoked from ${user.name}.`,
            'success'
          );
          this.dashboardCache.invalidateAdminUsers();
          this.dashboardCache.invalidateRawUsers();
        },
        error: err => {
          this.toastService.show(err?.error?.message || 'Something went wrong.', 'error');
        },
      });
  }

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
          this.dashboardCache.invalidateAdminUsers();
          this.dashboardCache.invalidateRawUsers();
          this.pendingDeleteUser.set(null);
        },
        error: err => {
          this.toastService.show(err?.error?.message || 'Something went wrong.', 'error');
          this.pendingDeleteUser.set(null);
        },
      });
  }

  cancelDelete(): void { this.showDeleteConfirm.set(false); this.pendingDeleteUser.set(null); }

  // ── Bulk selection & actions ────────────────────────────────────────────
  // Freezing/deleting/granting-premium one-at-a-time was the only option
  // before - selecting rows across the current page lets an admin apply the
  // same action to many users at once.
  selectedIds = signal<Set<string>>(new Set());

  isSelected(id: string): boolean { return this.selectedIds().has(id); }

  toggleSelect(id: string): void {
    const next = new Set(this.selectedIds());
    if (next.has(id)) next.delete(id); else next.add(id);
    this.selectedIds.set(next);
  }

  allOnPageSelected = computed(() =>
    this.paginatedUsers().length > 0 && this.paginatedUsers().every(u => this.selectedIds().has(u._id))
  );

  toggleSelectAllOnPage(): void {
    const next = new Set(this.selectedIds());
    if (this.allOnPageSelected()) {
      this.paginatedUsers().forEach(u => next.delete(u._id));
    } else {
      this.paginatedUsers().forEach(u => next.add(u._id));
    }
    this.selectedIds.set(next);
  }

  clearSelection(): void { this.selectedIds.set(new Set()); }

  selectedCount = computed(() => this.selectedIds().size);

  bulkBusy = signal(false);
  pendingBulkAction = signal<BulkAction | null>(null);

  requestBulkAction(action: BulkAction): void {
    if (!this.selectedCount()) return;
    this.pendingBulkAction.set(action);
  }
  cancelBulkAction(): void { this.pendingBulkAction.set(null); }

  bulkActionLabel(action: BulkAction | null): string {
    switch (action) {
      case 'freeze':         return 'Freeze';
      case 'unfreeze':       return 'Unfreeze';
      case 'grant-premium':  return 'Grant Premium to';
      case 'revoke-premium': return 'Revoke Premium from';
      case 'delete':         return 'Delete';
      default:                return '';
    }
  }

  confirmBulkAction(): void {
    const action = this.pendingBulkAction();
    this.pendingBulkAction.set(null);
    if (!action || this.bulkBusy()) return;

    // Lifetime-access users (admins/mentors) already have automatic access -
    // toggling Premium on them is a no-op the backend would reject, so leave
    // them out of a bulk premium action instead of reporting a false failure.
    let targets = this.allUsers().filter(u => this.selectedIds().has(u._id));
    if (action === 'grant-premium' || action === 'revoke-premium') {
      targets = targets.filter(u => !hasLifetimeAccess(u));
    }
    if (!targets.length) { this.clearSelection(); return; }

    this.bulkBusy.set(true);
    let remaining = targets.length;
    let failed = 0;

    const call$ = (user: User) => {
      switch (action) {
        case 'freeze':         return this.adminService.freezeUser(user._id);
        case 'unfreeze':       return this.adminService.unFreezeUser(user._id);
        case 'grant-premium':  return this.adminService.setPremium(user._id, true);
        case 'revoke-premium': return this.adminService.setPremium(user._id, false);
        case 'delete':         return this.adminService.deleteUser(user._id);
      }
    };

    targets.forEach(user => {
      call$(user).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: () => {
          if (action === 'delete') {
            this.allUsers.update(list => list.filter(u => u._id !== user._id));
          } else if (action === 'freeze' || action === 'unfreeze') {
            user.status = action === 'freeze' ? 'inactive' : 'active';
            this.allUsers.update(users => [...users]);
          } else {
            user.isPremium = action === 'grant-premium';
            this.allUsers.update(users => [...users]);
          }
          remaining--;
          if (remaining === 0) this.finishBulkAction(targets.length, failed);
        },
        error: () => {
          failed++;
          remaining--;
          if (remaining === 0) this.finishBulkAction(targets.length, failed);
        },
      });
    });
  }

  private finishBulkAction(total: number, failed: number): void {
    this.bulkBusy.set(false);
    this.clearSelection();
    // Bulk delete can empty out the current page entirely (more likely than
    // with a single delete) - fall back a page rather than show a blank one.
    if (this.currentPage() > this.totalPages()) this.currentPage.set(this.totalPages());
    this.dashboardCache.invalidateAdminUsers();
    this.dashboardCache.invalidateRawUsers();
    if (failed === 0) {
      this.toastService.show(`Updated ${total} user${total === 1 ? '' : 's'}.`, 'success');
    } else {
      this.toastService.show(
        `Updated ${total - failed} of ${total} user${total === 1 ? '' : 's'} - ${failed} failed.`,
        failed === total ? 'error' : 'warning'
      );
    }
  }

  timeAgo(date: any): string {
    if (!date) return '-';
    const diff = Date.now() - new Date(date).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1)   return 'just now';
    if (m < 60)  return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24)  return `${h}h ago`;
    const d = Math.floor(h / 24);
    if (d < 30)  return `${d}d ago`;
    const mo = Math.floor(d / 30);
    return `${mo}mo ago`;
  }

  avatarColor(name: string): string {
    const colors = ['#2563EB','#14B8A6','#f59e0b','#8b5cf6','#ef4444','#06b6d4','#10b981','#f97316'];
    let hash = 0;
    for (const c of name ?? '') hash = c.charCodeAt(0) + ((hash << 5) - hash);
    return colors[Math.abs(hash) % colors.length];
  }

  /* -1 is the ellipsis sentinel ("…") - keeps the button count capped at
     7 slots (1, …, cur-1..cur+1, …, total) regardless of totalPages, so the
     nav row fits in one line on mobile instead of needing to scroll. */
  static readonly PAGE_ELLIPSIS = -1;

  visiblePages = computed(() => {
    const total = this.totalPages();
    const cur   = this.currentPage();
    if (total <= 7) return this.pages();

    const ELLIPSIS = ManageUsers.PAGE_ELLIPSIS;
    let start = Math.max(2, cur - 1);
    let end   = Math.min(total - 1, cur + 1);
    // Collapsing a single hidden page into "…" saves no space and just
    // looks like a gap (e.g. "1 3 4 5" with page 2 silently missing) -
    // show it directly instead of eliding it.
    if (start === 3) start = 2;
    if (end === total - 2) end = total - 1;

    const pages: number[] = [1];
    if (start > 2) pages.push(ELLIPSIS);
    for (let i = start; i <= end; i++) pages.push(i);
    if (end < total - 1) pages.push(ELLIPSIS);
    pages.push(total);
    return pages;
  });

  ngOnDestroy(): void {
    clearTimeout(this.timer);
    document.removeEventListener('visibilitychange', this._onVisibilityChange);
  }
}