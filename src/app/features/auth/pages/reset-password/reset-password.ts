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

  private auth  = inject(Auth);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

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
    this.route.queryParams.subscribe(params => {
      const tokenFromURL = params['token'];

      console.log('🔑 Raw token from URL:', tokenFromURL);
      console.log('🔑 Token length:', tokenFromURL?.length);

      if (!tokenFromURL) {
        this.errorMessage.set('Invalid or missing reset token. Please request a new password reset link.');
        return;
      }

      // Store token as-is (it's a hex string, no need to decode)
      const cleanToken = tokenFromURL.trim();
      this.token.set(cleanToken);
      
      console.log('✅ Final decoded token:', cleanToken);
      console.log('✅ Final token length:', cleanToken.length);
    });
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

    if (this.resetForm.invalid) {
      this.resetForm.markAllAsTouched();
      return;
    }

    if (!this.token() || this.token().trim() === '') {
      this.errorMessage.set('Reset token is missing. Please request a new password reset link.');
      return;
    }

    const { newPassword } = this.resetForm.value;
    
    if (!newPassword) {
      this.errorMessage.set('Please enter a new password.');
      return;
    }

    this.isLoading.set(true);

    console.log('🚀 Sending reset password request');
    console.log('📤 Token (first 20 chars):', this.token().substring(0, 20) + '...');
    console.log('📤 New password length:', newPassword.length);

    this.auth.resetPassword(this.token(), newPassword).subscribe({
      next: (response) => {
        console.log('✅ Password reset successful:', response);
        this.isLoading.set(false);
        this.isSuccess.set(true);
        
        setTimeout(() => {
          this.router.navigate(['/auth/login'], {
            queryParams: { 
              message: 'Password reset successful! Please login with your new password.' 
            }
          });
        }, 2000);
      },
      error: (err: HttpErrorResponse) => {
        console.error('❌ Password reset failed:', err);
        console.error('❌ Error status:', err.status);
        console.error('❌ Error response:', err.error);
        console.error('❌ Full error object:', JSON.stringify(err.error, null, 2));
        console.error('❌ Error message from backend:', err.error?.message);
        
        this.isLoading.set(false);
        
        // Display the exact error message from backend
        const backendMessage = err.error?.message || err.error?.error;
        
        if (backendMessage) {
          this.errorMessage.set(backendMessage);
        } else if (err.status === 400) {
          this.errorMessage.set('Invalid or expired reset token. Please request a new password reset link.');
        } else if (err.status === 401) {
          this.errorMessage.set('Unauthorized. Please request a new password reset link.');
        } else if (err.status === 404) {
          this.errorMessage.set('Reset token not found. Please request a new password reset link.');
        } else {
          this.errorMessage.set('Something went wrong. Please try again or request a new reset link.');
        }
      }
    });
  }

  requestNewLink() {
    this.router.navigate(['/auth/forgot-password']);
  }
}