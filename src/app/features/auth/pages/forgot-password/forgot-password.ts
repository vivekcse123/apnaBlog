import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormGroup, FormControl, Validators } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { Auth } from '../../../../core/services/auth';

@Component({
  selector: 'app-forgot-password',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule],
  templateUrl: './forgot-password.html',
  styleUrls: ['./forgot-password.css']
})
export class ForgotPassword {

  // ── Signals — matches login pattern ──
  isLoading    = signal(false);
  isSuccess    = signal(false);
  isSubmitted  = signal(false);
  errorMessage = signal('');
  sentToEmail  = signal('');

  // ── Reactive Form ──
  forgotForm = new FormGroup({
    email: new FormControl('', [
      Validators.required,
      Validators.pattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)
    ])
  });

  constructor(private authService: Auth) {}

  onSubmit() {
    this.isSubmitted.set(true);
    this.errorMessage.set('');

    if (this.forgotForm.invalid) return;

    const email = this.forgotForm.value.email!;
    this.isLoading.set(true);

    this.authService.forgotPassword(email).subscribe({
      next: () => {
        this.isLoading.set(false);
        this.sentToEmail.set(email);
        this.isSuccess.set(true);
      },
      error: (err) => {
        this.isLoading.set(false);
        this.errorMessage.set(
          err?.error?.message || 'Something went wrong. Please try again.'
        );
      }
    });
  }

  resend() {
    this.isSuccess.set(false);
    this.isSubmitted.set(false);
    this.forgotForm.setValue({ email: this.sentToEmail() });
  }
}