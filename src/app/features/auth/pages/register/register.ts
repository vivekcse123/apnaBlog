import {
  ChangeDetectionStrategy, Component, DestroyRef, inject, signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import {
  AbstractControl, FormControl, FormGroup,
  ReactiveFormsModule, ValidationErrors, ValidatorFn, Validators,
} from '@angular/forms';
import { Meta } from '@angular/platform-browser';
import { Auth } from '../../../../core/services/auth';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

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
  imports: [CommonModule, RouterLink, ReactiveFormsModule],
  templateUrl: './register.html',
  styleUrl: './register.css',
})
export class Register {
  private authService = inject(Auth);
  private router      = inject(Router);
  private destroyRef  = inject(DestroyRef);
  private meta        = inject(Meta);

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

  isSubmitted    = signal(false);
  isLoading      = signal(false);
  errorMessage   = signal('');
  successMessage = signal('');
  showPassword   = false;

  constructor() {
    this.meta.updateTag({ name: 'robots', content: 'noindex, nofollow' });
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
