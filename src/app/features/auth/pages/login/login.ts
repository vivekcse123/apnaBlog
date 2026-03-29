import { Component, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { FormBuilder, FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { Auth } from '../../../../core/services/auth';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule, ReactiveFormsModule],
  templateUrl: './login.html',
  styleUrl: './login.css',
})
export class Login implements OnInit {
  private fb          = inject(FormBuilder);
  private authService = inject(Auth);
  private router      = inject(Router);
  private destroyRef  = inject(DestroyRef);

  loginForm: FormGroup = new FormGroup({});

  isSubmitted    = signal(false);
  isLoading      = signal(false);
  errorMessage   = signal('');
  successMessage = signal('');
  showPassword   = false;

  ngOnInit(): void {
    this.loginForm = this.fb.group({
      email:   new FormControl('', [
        Validators.required,
        Validators.pattern(/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/)
      ]),
      password: new FormControl('', [Validators.required]),
      loginAt:  new FormControl(Date.now()),
    });
  }

  login() {
    this.isSubmitted.set(true);
    this.errorMessage.set('');
    this.successMessage.set('');

    if (this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
      return;
    }

    this.isLoading.set(true);

    this.authService.login(this.loginForm.value)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.isLoading.set(false);

          const data   = res.data as any;  // cast to access _id & token
          const userId = data?._id;
          const role   = data?.role?.toLowerCase();
          const token  = data?.token;

          console.log('🔍 Login response:', { userId, role, token }); // remove after testing

          if (!userId || !role || !token) {
            this.errorMessage.set('Login failed. Please try again.');
            return;
          }

          this.successMessage.set('Logged in successfully!');

          setTimeout(() => {
            this.router.navigate(['/', role, userId]);
          }, 300);
        },
        error: (err) => {
          this.isLoading.set(false);
          this.errorMessage.set(
            err?.error?.message || 'Login failed. Please try again.'
          );
        },
      });
  }
}