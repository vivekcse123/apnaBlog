import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormGroup, FormControl, Validators } from '@angular/forms';
import { RouterModule, ActivatedRoute, Router } from '@angular/router';
import { Auth } from '../../../../core/services/auth';
import { HttpErrorResponse } from '@angular/common/http';

@Component({
  selector: 'app-reset-password',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule],
  templateUrl: './reset-password.html',
  styleUrls: ['./reset-password.css']
})
export class ResetPassword implements OnInit {

  private auth = inject(Auth);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  isLoading    = signal(false);
  isSuccess    = signal(false);
  isSubmitted  = signal(false);
  errorMessage = signal('');
  showPassword = signal(false);
  token        = signal<string | null>(null);

  // ✅ FIXED: minLength = 8 (matches backend)
  resetForm = new FormGroup({
    newPassword: new FormControl('', [
      Validators.required,
      Validators.minLength(8)
    ]),
    confirmPassword: new FormControl('', [Validators.required])
  }, { validators: this.passwordMatchValidator });

  ngOnInit() {
    const tokenFromURL = this.route.snapshot.queryParamMap.get('token');

    if (!tokenFromURL) {
      this.errorMessage.set('Invalid or missing reset token.');
      return;
    }

    this.token.set(tokenFromURL.trim());

    console.log('✅ Token received:', this.token());
  }

  passwordMatchValidator(form: any) {
    const pwd = form.get('newPassword')?.value;
    const confirm = form.get('confirmPassword')?.value;
    return pwd === confirm ? null : { passwordMismatch: true };
  }

  togglePassword() {
    this.showPassword.set(!this.showPassword());
  }

  onSubmit() {
    this.isSubmitted.set(true);
    this.errorMessage.set('');

    if (this.resetForm.invalid) {
      this.resetForm.markAllAsTouched();
      return;
    }

    if (!this.token()) {
      this.errorMessage.set('Reset token missing.');
      return;
    }

    const newPassword = this.resetForm.value.newPassword!;

    this.isLoading.set(true);

    this.auth.resetPassword(this.token()!, newPassword).subscribe({
      next: () => {
        this.isLoading.set(false);
        this.isSuccess.set(true);

        setTimeout(() => {
          this.router.navigate(['/auth/login'], {
            queryParams: {
              message: 'Password reset successful!'
            }
          });
        }, 1500);
      },
      error: (err: HttpErrorResponse) => {
        this.isLoading.set(false);

        const msg = err.error?.message;

        if (msg) {
          this.errorMessage.set(msg);
        } else {
          this.errorMessage.set('Something went wrong. Try again.');
        }

        console.error('❌ Reset error:', err);
      }
    });
  }

  requestNewLink() {
    this.router.navigate(['/auth/forgot-password']);
  }
}