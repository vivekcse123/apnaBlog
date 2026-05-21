import { Component, signal, inject, output, DestroyRef } from '@angular/core';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { Auth } from '../../../../core/services/auth';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

const INDUSTRIES = [
  'Technology', 'E-Commerce', 'Fashion & Apparel', 'Food & Beverage',
  'Health & Wellness', 'Education', 'Finance & Banking', 'Real Estate',
  'Travel & Tourism', 'Entertainment', 'Automotive', 'Other',
];

@Component({
  selector: 'app-create-sponsor',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './create-sponsor.html',
  styleUrl: './create-sponsor.css',
})
export class CreateSponsor {
  private fb          = inject(FormBuilder);
  private auth        = inject(Auth);
  private destroyRef  = inject(DestroyRef);

  close         = output<void>();
  sponsorCreated = output<void>();

  isSubmitted   = signal(false);
  errorMessage  = signal('');
  successMessage = signal('');
  showPassword  = false;

  readonly industries = INDUSTRIES;

  form: FormGroup = this.fb.group({
    name:        ['', [Validators.required, Validators.minLength(3), Validators.maxLength(40)]],
    email:       ['', [Validators.required, Validators.pattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)]],
    companyName: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(80)]],
    phone:       ['', [Validators.required, Validators.pattern(/^[+]?[\d\s\-()]{7,15}$/)]],
    website:     ['', [Validators.pattern(/^(https?:\/\/)?([\w-]+\.)+[\w]{2,}(\/\S*)?$/)]],
    industry:    [''],
    password:    ['', [Validators.required, Validators.minLength(8), Validators.maxLength(32)]],
  });

  closeModal(): void { this.close.emit(); }

  submit(): void {
    this.isSubmitted.set(true);
    this.errorMessage.set('');
    this.successMessage.set('');

    if (this.form.invalid) return;

    const value = this.form.value;
    this.auth.register({ ...value, role: 'sponsor' })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.successMessage.set('Sponsor account created successfully!');
          setTimeout(() => {
            this.sponsorCreated.emit();
            this.closeModal();
          }, 1000);
        },
        error: err => {
          const msg = err?.error?.message;
          this.errorMessage.set(Array.isArray(msg) ? msg[0] : (msg ?? 'Something went wrong!'));
        },
      });
  }
}
