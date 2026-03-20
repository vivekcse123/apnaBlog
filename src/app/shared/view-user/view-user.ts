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
  private fb           = inject(FormBuilder);
  private userService  = inject(UserService);
  private adminService = inject(AdminService);
  private destroy$     = new Subject<void>();

  userId      = input<string>('');
  message = input<string>('');
  close       = output<void>();
  userUpdated = output<User>();

  user           = signal<any>(null);
  isEditing      = signal(false);
  successMessage = signal('');
  errorMessage   = signal('');
  editForm!: FormGroup;

  ngOnInit(): void {
    this.loadUser();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadUser(): void {
    this.userService.getUserById(this.userId())
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => this.user.set(res.data ?? res),
        error: (err) => console.error(err)
      });
  }

  startEdit(): void {
    const u = this.user();
    this.successMessage.set('');
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
    this.successMessage.set('');
    this.errorMessage.set('');
    this.editForm.reset();
  }

  saveUser(): void {
    if (this.editForm.invalid) return;

    this.successMessage.set('');
    this.errorMessage.set('');

    this.adminService.updateUser(this.user()?._id, this.editForm.value)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          const updated = res.data ?? { ...this.user(), ...this.editForm.value };

          this.user.set(updated);
          this.isEditing.set(false);
          this.userUpdated.emit(updated);
           this.successMessage.set('Post updated successfully!');


        setTimeout(() => {
          this.successMessage.set('');
          this.userUpdated.emit(updated);
          this.closeModal();
        }, 1500);
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