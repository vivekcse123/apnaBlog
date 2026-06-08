import {
  ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, signal, afterNextRender
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink, ActivatedRoute } from '@angular/router';
import { FormBuilder, FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { Meta } from '@angular/platform-browser';
import { Auth } from '../../../../core/services/auth';
import { ToastService } from '../../../../core/services/toast.service';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

declare const google: any;

@Component({
  selector: 'app-login',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
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

  isSubmitted     = signal(false);
  isLoading       = signal(false);
  isGoogleLoading = signal(false);
  errorMessage    = signal('');
  showPassword    = false;

  constructor() {
    afterNextRender(() => {
      const init = () => {
        google.accounts.id.initialize({
          client_id: '602340491283-om39opmifq815fsvs15ju1et07kk0laq.apps.googleusercontent.com',
          callback: (response: any) => this.handleGoogleCallback(response),
        });
      };
      if (typeof google !== 'undefined') {
        init();
      } else {
        (window as any)['onGoogleLibraryLoad'] = init;
      }
    });
  }

  signInWithGoogle(): void {
    if (typeof google === 'undefined') return;
    google.accounts.id.prompt();
  }

  handleGoogleCallback(response: any): void {
    this.isGoogleLoading.set(true);
    this.errorMessage.set('');
    this.authService.googleLogin(response.credential)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.isGoogleLoading.set(false);
          const data   = res.data as any;
          const userId = data?._id;
          const role   = data?.role;
          const token  = data?.token;
          if (!userId || !role || !token) {
            this.errorMessage.set('Google sign-in failed. Please try again.');
            return;
          }
          this.toastService.show('Welcome to ApnaInsights!', 'success');
          if (role === 'super_admin')     this.router.navigate(['/super-admin', userId]);
          else if (role === 'admin')      this.router.navigate(['/admin', userId]);
          else if (role === 'sponsor')    this.router.navigate(['/sponsor', userId]);
          else                            this.router.navigate(['/user', userId]);
        },
        error: (err) => {
          this.isGoogleLoading.set(false);
          this.errorMessage.set(err?.error?.message || 'Google sign-in failed. Please try again.');
        },
      });
  }

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
          } else if (role === 'sponsor') {
            this.router.navigate(['/sponsor', userId]);
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