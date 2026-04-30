import { Component, effect, inject, input, OnDestroy, output, signal, untracked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Subject, takeUntil, finalize } from 'rxjs';
import { AdminService } from '../../features/admin/services/admin-service';
import { UserService } from '../../features/user/services/user-service';
import { User } from '../../features/user/models/user.mode';
import { ToastService } from '../../core/services/toast.service';

@Component({
  selector: 'app-view-user',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './view-user.html',
  styleUrl: './view-user.css'
})
export class ViewUser implements OnDestroy {
  private fb           = inject(FormBuilder);
  private userService  = inject(UserService);
  private adminService = inject(AdminService);
  private toastService = inject(ToastService);
  private destroy$     = new Subject<void>();

  userId        = input<string>('');
  preloadedUser = input<any>(null);   // passed from list for zero-wait first render
  message       = input<string>('');
  close         = output<void>();
  userUpdated   = output<User>();

  user      = signal<any>(null);
  isLoading = signal(false);
  isEditing = signal(false);
  isSaving  = signal(false);
  errorMessage = signal('');
  editForm!: FormGroup;

  totalBlogs = signal<number>(0);
  totalViews = signal<number>(0);

  constructor() {
    effect(() => {
      const id = this.userId();
      if (!id) return;
      // Read preloadedUser without tracking it — prevents the effect from
      // re-firing when the parent nulls out selectedUserObj during close.
      const preload = untracked(() => this.preloadedUser());
      this.loadUser(id, preload);
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadUser(id: string, preload: any = null): void {
    this.isEditing.set(false);
    this.errorMessage.set('');

    // Show preloaded row data instantly — no spinner for the first paint.
    if (preload && (preload._id === id || preload.id === id)) {
      this.user.set(preload);
      this.isLoading.set(false);
    } else {
      this.user.set(null);
      this.totalBlogs.set(0);
      this.totalViews.set(0);
      this.isLoading.set(true);
    }

    // Always fetch fresh data (picks up latest stats; UserService TTL-caches it).
    this.userService.getUserById(id)
      .pipe(takeUntil(this.destroy$), finalize(() => this.isLoading.set(false)))
      .subscribe({
        next: res => {
          this.user.set(res.data ?? res);
          this.totalBlogs.set((res as any).totalBlogs ?? 0);
          this.totalViews.set((res as any).totalViews ?? 0);
          this.isLoading.set(false);
        },
        error: () => {
          if (!this.user()) this.toastService.show('Failed to load user details.', 'error');
        },
      });
  }

  startEdit(): void {
    const u = this.user();
    this.errorMessage.set('');

    this.editForm = this.fb.group({
      name:     [u?.name     || '', [Validators.required]],
      email:    [u?.email    || '', [Validators.required, Validators.email]],
      dob:      [this.formatDate(u?.dob)],
      location: [u?.location || ''],
      role:     [u?.role     || 'user'],
      status:   [u?.status   || 'active'],
    });

    this.isEditing.set(true);
  }

  cancelEdit(): void {
    this.isEditing.set(false);
    this.errorMessage.set('');
    this.editForm.reset();
  }

  saveUser(): void {
    if (this.editForm.invalid) return;

    this.isSaving.set(true);
    this.errorMessage.set('');

    const uid = this.user()?._id;
    this.adminService.updateUser(uid, this.editForm.value)
      .pipe(takeUntil(this.destroy$), finalize(() => this.isSaving.set(false)))
      .subscribe({
        next: (res) => {
          if (uid) this.userService.invalidate(uid);
          const updated = res.data ?? { ...this.user(), ...this.editForm.value };
          this.user.set(updated);
          this.isEditing.set(false);
          this.toastService.show('User updated successfully', 'success');
          this.userUpdated.emit(updated); // parent's onUserUpdated closes the modal
        },
        error: (err) => {
          this.errorMessage.set(err?.error?.message ?? 'Something went wrong. Please try again.');
        }
      });
  }

  calculateAge(dob: string | undefined): string {
    if (!dob) return 'N/A';
    const diff = Date.now() - new Date(dob).getTime();
    return Math.floor(diff / (1000 * 60 * 60 * 24 * 365.25)) + ' years';
  }

  formatDate(date: string | undefined): string {
    if (!date) return '';
    return new Date(date).toISOString().split('T')[0];
  }

  closeModal(): void {
    this.close.emit();
  }
}
