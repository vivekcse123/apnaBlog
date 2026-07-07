import {
  ChangeDetectionStrategy, Component, DestroyRef, ElementRef, ViewChild, inject, signal, afterNextRender
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import {
  AbstractControl, FormControl, FormGroup,
  ReactiveFormsModule, ValidationErrors, ValidatorFn, Validators,
} from '@angular/forms';
import { Meta } from '@angular/platform-browser';
import { Auth } from '../../../../core/services/auth';
import { ToastService } from '../../../../core/services/toast.service';
import { pollUntilGoogleIdentityReady } from '../../../../core/utils/google-identity.util';
import { AuthTrustBar } from '../../../../shared/auth-trust-bar/auth-trust-bar';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

declare const google: any;

function ageRangeValidator(minAge: number, maxAge: number): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    if (!control.value) return null;
    const dob = new Date(control.value);
    if (isNaN(dob.getTime())) return { invalidDate: true };
    const today = new Date();
    if (dob >= today) return { futureDate: true };
    let age = today.getFullYear() - dob.getFullYear();
    const m = today.getMonth() - dob.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
    if (age < minAge) return { tooYoung: { required: minAge, actual: age } };
    if (age > maxAge) return { tooOld: true };
    return null;
  };
}

@Component({
  selector: 'app-register',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterLink, ReactiveFormsModule, AuthTrustBar],
  templateUrl: './register.html',
  styleUrls: ['../../auth-shared.css', './register.css'],
})
export class Register {
  private authService  = inject(Auth);
  private router       = inject(Router);
  private destroyRef   = inject(DestroyRef);
  private meta         = inject(Meta);
  private toastService = inject(ToastService);

  // Google's own rendered button lives invisibly on top of our styled button
  // (see register.html/.css) - see the comment in the constructor for why.
  @ViewChild('googleBtnSlot') googleBtnSlot!: ElementRef<HTMLDivElement>;

  // Build the form immediately - no ngOnInit flash
  registerForm = new FormGroup({
    name: new FormControl('', [
      Validators.required,
      Validators.minLength(3),
      Validators.maxLength(30),
      Validators.pattern(/^[a-zA-Z][a-zA-Z\s'\-]*$/),
    ]),
    email: new FormControl('', [
      Validators.required,
      Validators.pattern(/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/),
    ]),
    dob: new FormControl('', [
      Validators.required,
      ageRangeValidator(13, 100),
    ]),
    password: new FormControl('', [
      Validators.required,
      Validators.minLength(8),
      Validators.maxLength(30),
      Validators.pattern(/^(?=.*[a-zA-Z])(?=.*[0-9]).+$/),
    ]),
    role: new FormControl('user'),
  });

  isSubmitted     = signal(false);
  isLoading       = signal(false);
  isGoogleLoading = signal(false);
  errorMessage    = signal('');
  successMessage  = signal('');
  showPassword    = false;

  constructor() {
    this.meta.updateTag({ name: 'robots', content: 'noindex, nofollow' });

    afterNextRender(() => {
      // One Tap's prompt() is a heuristic the browser/Google can silently
      // skip or delay (third-party-cookie/FedCM checks, prior-dismissal
      // cooldown, etc.) - it is NOT reliable as a direct button-click
      // handler. Google's own rendered button doesn't have that problem:
      // clicking it opens the real sign-up flow immediately, every time.
      // So we render Google's actual button, invisibly, on top of our
      // custom-styled one (see register.html/.css) - visually it's our
      // button, but the click is always handled natively by Google's client.
      pollUntilGoogleIdentityReady(() => {
        google.accounts.id.initialize({
          client_id: '602340491283-om39opmifq815fsvs15ju1et07kk0laq.apps.googleusercontent.com',
          callback: (response: any) => this.handleGoogleCallback(response),
        });
        const width = Math.min(400, Math.max(200, this.googleBtnSlot?.nativeElement.offsetWidth || 300));
        google.accounts.id.renderButton(this.googleBtnSlot.nativeElement, {
          type: 'standard', theme: 'outline', size: 'large', width, text: 'signup_with',
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
            this.errorMessage.set('Google sign-up failed. Please try again.');
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
          this.errorMessage.set(err?.error?.message || 'Google sign-up failed. Please try again.');
        },
      });
  }

  get maxDob(): string {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 13);
    return d.toISOString().split('T')[0];
  }

  get passwordStrength(): 'weak' | 'fair' | 'strong' {
    const pw = this.registerForm.get('password')?.value ?? '';
    if (pw.length < 8) return 'weak';
    let score = 0;
    if (pw.length >= 10)         score++;
    if (/[A-Z]/.test(pw))        score++;
    if (/[0-9]/.test(pw))        score++;
    if (/[^a-zA-Z0-9]/.test(pw)) score++;
    if (score >= 3) return 'strong';
    if (score >= 1) return 'fair';
    return 'weak';
  }

  register(): void {
    this.isSubmitted.set(true);

    if (this.registerForm.invalid) {
      this.registerForm.markAllAsTouched();
      return;
    }

    this.isLoading.set(true);

    this.authService.register(this.registerForm.value as any)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.isLoading.set(false);
          const email = this.registerForm.get('email')?.value ?? 'your inbox';
          this.successMessage.set(
            `Account created! A welcome email has been sent to ${email}. Redirecting to login…`
          );
          this.errorMessage.set('');
          setTimeout(() => this.router.navigate(['/auth/login']), 3000);
        },
        error: (err) => {
          this.isLoading.set(false);
          this.successMessage.set('');
          this.errorMessage.set(
            err?.error?.message ?? 'Something went wrong. Please try again.'
          );
        },
      });
  }
}
