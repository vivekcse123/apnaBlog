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
    // Subscribe to query params to handle encoded tokens
    this.route.queryParams.subscribe(params => {
      let tokenFromURL = params['token'];

      console.log('🔑 Raw token from URL:', tokenFromURL);
      console.log('🔑 Token length:', tokenFromURL?.length);

      if (!tokenFromURL) {
        this.errorMessage.set('Invalid or missing reset token. Please request a new password reset link.');
        return;
      }

      // Remove any whitespace that might have been added
      tokenFromURL = tokenFromURL.trim();

      // The token might be double-encoded, so try decoding
      try {
        // First decode attempt
        let decodedToken = decodeURIComponent(tokenFromURL);
        
        // If it still looks encoded (contains %), decode again
        if (decodedToken.includes('%')) {
          decodedToken = decodeURIComponent(decodedToken);
        }
        
        this.token.set(decodedToken);
        console.log('✅ Final decoded token:', decodedToken);
        console.log('✅ Final token length:', decodedToken.length);
      } catch (error) {
        console.error('❌ Token decoding failed:', error);
        // If decoding fails, use the original token
        this.token.set(tokenFromURL);
      }
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

    // Validate form
    if (this.resetForm.invalid) {
      this.resetForm.markAllAsTouched();
      return;
    }

    // Validate token exists
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

    // Call the reset password API
    this.auth.resetPassword(this.token(), newPassword).subscribe({
      next: (response) => {
        console.log('✅ Password reset successful:', response);
        this.isLoading.set(false);
        this.isSuccess.set(true);
        
        // Redirect to login after 2 seconds
        setTimeout(() => {
          this.router.navigate(['/auth/login'], {
            queryParams: { 
              message: 'Password reset successful! Please login with your new password.' 
            }
          });
        }, 2000);
      },
      error: (err) => {
        console.error('❌ Password reset failed:', err);
        console.error('❌ Error status:', err?.status);
        console.error('❌ Error response:', err?.error);
        
        this.isLoading.set(false);
        
        // Handle specific error cases
        if (err?.status === 400 || err?.status === 401) {
          this.errorMessage.set('Invalid or expired reset token. Please request a new password reset link.');
        } else if (err?.status === 404) {
          this.errorMessage.set('Reset token not found. Please request a new password reset link.');
        } else if (err?.error?.message) {
          this.errorMessage.set(err.error.message);
        } else {
          this.errorMessage.set('Something went wrong. Please try again or request a new reset link.');
        }
      }
    });
  }

  // Helper method to request a new reset link
  requestNewLink() {
    this.router.navigate(['/auth/forgot-password']);
  }
}