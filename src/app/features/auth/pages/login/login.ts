import {
  ChangeDetectionStrategy, Component, DestroyRef, ElementRef, OnInit, ViewChild, inject, signal, afterNextRender
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink, ActivatedRoute } from '@angular/router';
import { FormBuilder, FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { Meta } from '@angular/platform-browser';
import { Auth } from '../../../../core/services/auth';
import { ToastService } from '../../../../core/services/toast.service';
import { pollUntilGoogleIdentityReady } from '../../../../core/utils/google-identity.util';
import { AuthTrustBar } from '../../../../shared/auth-trust-bar/auth-trust-bar';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

declare const google: any;

@Component({
  selector: 'app-login',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterLink, FormsModule, ReactiveFormsModule, AuthTrustBar],
  templateUrl: './login.html',
  styleUrls: ['../../auth-shared.css', './login.css'],
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

  // Google's own rendered button lives invisibly on top of our styled button
  // (see login.html/.css) - see the comment on signInWithGoogle() for why.
  @ViewChild('googleBtnSlot') googleBtnSlot!: ElementRef<HTMLDivElement>;

  isSubmitted     = signal(false);
  isLoading       = signal(false);
  isGoogleLoading = signal(false);
  errorMessage    = signal('');
  showPassword    = false;

  constructor() {
    afterNextRender(() => {
      // One Tap's prompt() is a heuristic the browser/Google can silently
      // skip or delay (third-party-cookie/FedCM checks, prior-dismissal
      // cooldown, etc.) - it is NOT reliable as a direct button-click
      // handler. Google's own rendered button doesn't have that problem:
      // clicking it opens the real sign-in flow immediately, every time.
      // So we render Google's actual button, invisibly, on top of our
      // custom-styled one (see login.html/.css) - visually it's our button,
      // but the click is always handled natively by Google's client.
      pollUntilGoogleIdentityReady(() => {
        google.accounts.id.initialize({
          client_id: '602340491283-om39opmifq815fsvs15ju1et07kk0laq.apps.googleusercontent.com',
          callback: (response: any) => this.handleGoogleCallback(response),
        });
        const width = Math.min(400, Math.max(200, this.googleBtnSlot?.nativeElement.offsetWidth || 300));
        google.accounts.id.renderButton(this.googleBtnSlot.nativeElement, {
          type: 'standard', theme: 'outline', size: 'large', width, text: 'signin_with',
        });
      });
    });
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