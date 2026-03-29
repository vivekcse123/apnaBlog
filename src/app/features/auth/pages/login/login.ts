import { Component, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink, ActivatedRoute } from '@angular/router';
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
  private route       = inject(ActivatedRoute);
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

    // Check for access denied error from route guard
    this.route.queryParams.subscribe(params => {
      if (params['error'] && params['message']) {
        this.errorMessage.set(`${params['error']}: ${params['message']}`);
      }
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

          const data   = res.data as any;
          const userId = data?._id;
          const role   = data?.role;
          const token  = data?.token;

          console.log('🔍 Login Component - Response:', { userId, role, token });

          if (!userId || !role || !token) {
            this.errorMessage.set('Login failed. Please try again.');
            return;
          }

          this.successMessage.set('Logged in successfully!');

          setTimeout(() => {
            if (role === 'admin') {
              this.router.navigate(['/admin', userId]);
            } else {
              this.router.navigate(['/user', userId]);
            }
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

  togglePasswordVisibility() {
    this.showPassword = !this.showPassword;
  }
}