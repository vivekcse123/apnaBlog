import { Component, inject, input, OnDestroy, OnInit, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import { AdminService } from '../../features/admin/services/admin-service';
import { UserService } from '../../features/user/services/user-service';
import { User } from '../../features/user/models/user.mode';

@Component({
  selector: 'app-view-user',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './view-user.html',
  styleUrl: './view-user.css'
})
export class ViewUser implements OnInit, OnDestroy {
  private fb          = inject(FormBuilder);
  private userService = inject(UserService);
  private adminService = inject(AdminService);
  private destroy$    = new Subject<void>();

  // ── Inputs / Outputs ──────────────────────────
  userId      = input<string>('');
  close       = output<void>();
  userUpdated = output<User>();        // ✅ emits updated user to parent

  // ── State ─────────────────────────────────────
  user      = signal<any>(null);
  isEditing = signal(false);
  editForm!: FormGroup;

  // ─────────────────────────────────────────────
  ngOnInit() {
    this.loadUser();
  }

  loadUser() {
    this.userService.getUserById(this.userId())
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => this.user.set(res.data ?? res),
        error: (err) => console.error(err)
      });
  }

  // ── Edit ──────────────────────────────────────
  startEdit() {
    const u = this.user();

    this.editForm = this.fb.group({
      name:     [u?.name     || '', [Validators.required]],
      email:    [u?.email    || '', [Validators.required, Validators.email]],
      dob:      [this.formatDate(u?.dob)],
      location: [u?.location || ''],
      // ✅ capitalize to match backend enum — 'User' / 'Admin'
      role:     [u?.role ? u.role.charAt(0).toUpperCase() + u.role.slice(1).toLowerCase() : 'User'],
      status:   [u?.status  || 'active']
    });

    this.isEditing.set(true);
  }

  cancelEdit() {
    this.isEditing.set(false);
    this.editForm.reset();
  }

  saveUser() {
    if (this.editForm.invalid) return;

    this.adminService.updateUser(this.user()?._id, this.editForm.value)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          const updated = res.data ?? { ...this.user(), ...this.editForm.value };

          // ✅ update local signal with server response
          this.user.set(updated);
          this.isEditing.set(false);

          // ✅ notify parent so table updates without refresh
          this.userUpdated.emit(updated);
        },
        error: (err) => console.error(err)
      });
  }

  // ── Helpers ───────────────────────────────────
  calculateAge(dob: string | undefined): string {
    if (!dob) return 'N/A';
    const diff = Date.now() - new Date(dob).getTime();
    return Math.floor(diff / (1000 * 60 * 60 * 24 * 365.25)) + ' years';
  }

  formatDate(date: string | undefined): string {
    if (!date) return '';
    return new Date(date).toISOString().split('T')[0];
  }

  closeModal(event?: Event) {
    this.close.emit();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }
}