import { Component, DestroyRef, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { FormBuilder, FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { Meta } from '@angular/platform-browser';
import { Auth } from '../../../../core/services/auth';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule, ReactiveFormsModule],
  templateUrl: './register.html',
  styleUrl: './register.css',
})
export class Register implements OnInit{
  private fb = inject(FormBuilder);
  private authService = inject(Auth);
  private router = inject(Router);
  private destroyRef = inject(DestroyRef);
  private meta = inject(Meta);

  registerForm: FormGroup = new FormGroup({});

  ngOnInit(): void {
    this.meta.updateTag({ name: 'robots', content: 'noindex, nofollow' });

    this.registerForm = this.fb.group({
      name: new FormControl('', [Validators.required, Validators.pattern(/^[a-zA-Z ]+$/), Validators.minLength(5), Validators.maxLength(15)]),
      email: new FormControl('', [Validators.required, Validators.pattern(/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/)]),
      dob: new FormControl('', [Validators.required]),
      password: new FormControl('', [Validators.required, Validators.minLength(5), Validators.maxLength(15)]),
      role: new FormControl('user'),
    });

  }

  isSubmitted  = signal(false);
  isLoading    = signal(false);
  errorMessage = signal('');
  successMessage = signal('');

  register(){
    this.isSubmitted.set(true);

    if(this.registerForm.invalid){
      this.registerForm.markAsTouched();
      return;
    }

    this.isLoading.set(true);

    this.authService.register(this.registerForm.value)
    .pipe(
      takeUntilDestroyed(this.destroyRef)
    )
    .subscribe({
      next: (res) =>{
        this.isLoading.set(false);
        const email = this.registerForm.get('email')?.value ?? 'your inbox';
        this.successMessage.set(`Account created! A welcome email has been sent to ${email}. Redirecting to login…`);
        this.errorMessage.set('');
        setTimeout(() =>{
          this.router.navigate(['/auth/login']);
        }, 3000);
      },
      error: (err) =>{
        this.isLoading.set(false);
        this.successMessage.set('');
        this.errorMessage.set(err?.error?.message);
      }
    })
  }

  showPassword = false;
}
