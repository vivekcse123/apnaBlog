import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormGroup, FormControl, Validators } from '@angular/forms';
import { RouterModule, ActivatedRoute, Router } from '@angular/router';
import { Auth } from '../../../../core/services/auth';

@Component({
  selector: 'app-reset-password',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule],
  templateUrl: './reset-password.html',
  styleUrls: ['./reset-password.css']
})
export class ResetPassword implements OnInit {

  private auth  = inject(Auth);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  // ── Signals ──
  isLoading    = signal(false);
  isSuccess    = signal(false);
  isSubmitted  = signal(false);
  errorMessage = signal('');
  showPassword = signal(false);
  token        = signal('');

  // ── Reactive Form ──
  resetForm = new FormGroup({
    newPassword:     new FormControl('', [Validators.required, Validators.minLength(6)]),
    confirmPassword: new FormControl('', [Validators.required])
  }, { validators: this.passwordMatchValidator });

  ngOnInit() {
    // ✅ Read token from URL: /reset-password?token=abc123
    const tokenFromURL = this.route.snapshot.queryParamMap.get('token');

    if (!tokenFromURL) {
      this.errorMessage.set('Invalid or missing reset token. Please request a new link.');
      return;
    }

    this.token.set(tokenFromURL);
  }

  passwordMatchValidator(form: any) {
    const pwd    = form.get('newPassword')?.value;
    const confirm = form.get('confirmPassword')?.value;
    return pwd === confirm ? null : { passwordMismatch: true };
  }

  togglePassword() {
    this.showPassword.set(!this.showPassword());
  }

  onSubmit() {
    this.isSubmitted.set(true);
    this.errorMessage.set('');

    if (this.resetForm.invalid || !this.token()) return;

    const { newPassword } = this.resetForm.value;
    this.isLoading.set(true);

    // ✅ Calls PUT /api/auth/reset-password  with token + newPassword
    this.auth.resetPassword(this.token(), newPassword!).subscribe({
      next: () => {
        this.isLoading.set(false);
        this.isSuccess.set(true);
        // Redirect to login after 3 seconds
        setTimeout(() => this.router.navigate(['/auth/login']), 3000);
      },
      error: (err) => {
        this.isLoading.set(false);
        this.errorMessage.set(
          err?.error?.message || 'Something went wrong. Please try again.'
        );
      }
    });
  }
}