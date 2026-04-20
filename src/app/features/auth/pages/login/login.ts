import { Component, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink, ActivatedRoute } from '@angular/router';
import { FormBuilder, FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { Meta } from '@angular/platform-browser';
import { Auth } from '../../../../core/services/auth';
import { ToastService } from '../../../../core/services/toast.service';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule, ReactiveFormsModule],
  templateUrl: './login.html',
  styleUrl: './login.css',
})
export class Login implements OnInit {
  private fb           = inject(FormBuilder);
  private authService  = inject(Auth);
  private router       = inject(Router);
  private route        = inject(ActivatedRoute);
  private destroyRef   = inject(DestroyRef);
  private toastService = inject(ToastService);
  private meta         = inject(Meta);

  loginForm: FormGroup = new FormGroup({});

  isSubmitted  = signal(false);
  isLoading    = signal(false);
  errorMessage = signal('');
  showPassword   = false;

  ngOnInit(): void {
    this.meta.updateTag({ name: 'robots', content: 'noindex, nofollow' });

    this.loginForm = this.fb.group({
      email:   new FormControl('', [
        Validators.required,
        Validators.pattern(/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/)
      ]),
      password: new FormControl('', [Validators.required]),
      loginAt:  new FormControl(Date.now()),
    });

    this.route.queryParams.subscribe(params => {
      if (params['error'] && params['message']) {
        this.errorMessage.set(`${params['error']}: ${params['message']}`);
      }
    });
  }

  login() {
    this.isSubmitted.set(true);
    this.errorMessage.set('');

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

          if (!userId || !role || !token) {
            this.errorMessage.set('Login failed. Please try again.');
            return;
          }

          this.toastService.show('Welcome to ApnaInsights!', 'success');

          if (role === 'super_admin') {
            this.router.navigate(['/super-admin', userId]);
          } else if (role === 'admin') {
            this.router.navigate(['/admin', userId]);
          } else {
            this.router.navigate(['/user', userId]);
          }
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