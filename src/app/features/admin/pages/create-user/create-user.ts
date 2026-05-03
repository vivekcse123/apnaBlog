import { Component, signal, inject, output, DestroyRef } from '@angular/core';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { Auth } from '../../../../core/services/auth';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

@Component({
  selector: 'app-create-user',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule],
  templateUrl: './create-user.html',
  styleUrl: './create-user.css'
})
export class CreateUser {

  private fb            = inject(FormBuilder);
  private authService   = inject(Auth);
  private destroyRef    = inject(DestroyRef);
  private route         = inject(ActivatedRoute);
  private router        = inject(Router);

  close = output<void>();
  userCreated = output<void>();

  isSubmitted = signal(false);
  errorMessage = signal('');
  successMessage = signal('');

  createUserForm: FormGroup = this.fb.group({
    name: ['', [
      Validators.required,
      Validators.pattern(/^[a-zA-Z\s]+$/),
      Validators.minLength(5),
      Validators.maxLength(15)
    ]],
    email: ['', [
      Validators.required,
      Validators.pattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)
    ]],
    dob: ['', Validators.required],
    password: ['', [
      Validators.required,
      Validators.minLength(5),
      Validators.maxLength(15)
    ]],
  });

  closeModal() {
    this.close.emit();
    if (this.router.url.includes('/create-user')) {
      this.router.navigate(['..'], { relativeTo: this.route });
    }
  }

  createUser() {
    this.isSubmitted.set(true);
    this.errorMessage.set('');
    this.successMessage.set('');

    if (this.createUserForm.invalid) return;
    this.authService.register(this.createUserForm.value)
    .pipe(
      takeUntilDestroyed(this.destroyRef)
    )
    .subscribe({
      next:(res) =>{
         this.successMessage.set('User created successfully!');
         setTimeout(() => {
          this.userCreated.emit();
          this.closeModal();
        }, 1000);
      },
      error: (err) =>{
    const message = err?.error?.message ?? "Something went wrong!";
    this.errorMessage.set(message);
      }
    })
  }
  showPassword = false;
}