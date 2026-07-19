import {
  ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, output, signal
} from '@angular/core';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { Auth } from '../../../../core/services/auth';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, of } from 'rxjs';
import { UserService } from '../../../user/services/user-service';
import { MOCK_EXPERTS } from '../../../career-guides/data/mock-experts';

@Component({
  selector: 'app-create-user',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ReactiveFormsModule, FormsModule],
  templateUrl: './create-user.html',
  styleUrl: './create-user.css'
})
export class CreateUser implements OnInit {

  private fb            = inject(FormBuilder);
  private authService   = inject(Auth);
  private userService   = inject(UserService);
  private destroyRef    = inject(DestroyRef);
  private route         = inject(ActivatedRoute);
  private router        = inject(Router);

  close = output<void>();
  userCreated = output<void>();

  isSubmitted = signal(false);
  errorMessage = signal('');
  successMessage = signal('');

  createUserForm: FormGroup = this.fb.group({
    name: ['', [
      Validators.required,
      Validators.pattern(/^[a-zA-Z\s]+$/),
      Validators.minLength(5),
      Validators.maxLength(15)
    ]],
    email: ['', [
      Validators.required,
      Validators.pattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)
    ]],
    dob: ['', Validators.required],
    password: ['', [
      Validators.required,
      Validators.minLength(5),
      Validators.maxLength(15)
    ]],
    role: ['user', Validators.required],
    makeMentor: [false],
    mentorSlug: [''],
  });

  readonly roles = [
    { value: 'user',    label: 'User' },
    { value: 'sponsor', label: 'Sponsor' },
    { value: 'admin',   label: 'Admin' },
  ];

  // Career Guides mentor slugs come from the static MOCK_EXPERTS catalog -
  // "make mentor" only links an existing catalog entry to a real account,
  // it doesn't create new marketplace cards (those still need a code change
  // to mock-experts.ts). Filtered down to slugs not already claimed by a
  // real mentor account, using the same real-follower-counts endpoint the
  // marketplace already calls (no new backend endpoint needed for this).
  expertSlugOptions = signal(MOCK_EXPERTS.map(e => ({ slug: e.slug, name: e.name })));

  ngOnInit(): void {
    this.userService.getMentorFollowerCounts()
      .pipe(takeUntilDestroyed(this.destroyRef), catchError(() => of({ data: [] as { expertSlug: string }[] })))
      .subscribe(res => {
        const taken = new Set(res.data.map(r => r.expertSlug));
        this.expertSlugOptions.set(MOCK_EXPERTS.map(e => ({ slug: e.slug, name: e.name })).filter(e => !taken.has(e.slug)));
      });
  }

  closeModal() {
    this.close.emit();
    if (this.router.url.includes('/create-user')) {
      this.router.navigate(['..'], { relativeTo: this.route });
    }
  }

  createUser() {
    this.isSubmitted.set(true);
    this.errorMessage.set('');
    this.successMessage.set('');

    if (this.createUserForm.invalid) return;
    const { makeMentor, mentorSlug } = this.createUserForm.value;
    if (makeMentor && !mentorSlug) {
      this.errorMessage.set('Pick a mentor slug to make this user a mentor.');
      return;
    }

    this.authService.register(this.createUserForm.value)
    .pipe(
      takeUntilDestroyed(this.destroyRef)
    )
    .subscribe({
      next:(res) =>{
         if (!makeMentor) {
           this.successMessage.set('User created successfully!');
           setTimeout(() => {
            this.userCreated.emit();
            this.closeModal();
          }, 1000);
           return;
         }

         this.userService.setMentor(res.data._id, { isMentor: true, mentorSlug })
           .pipe(takeUntilDestroyed(this.destroyRef))
           .subscribe({
             next: () => {
               this.successMessage.set('User created and mentor status granted!');
               setTimeout(() => {
                this.userCreated.emit();
                this.closeModal();
              }, 1000);
             },
             error: (err) => {
               const message = err?.error?.message ?? 'Something went wrong!';
               this.errorMessage.set(`User created, but mentor setup failed: ${message}`);
             },
           });
      },
      error: (err) =>{
    const message = err?.error?.message ?? "Something went wrong!";
    this.errorMessage.set(message);
      }
    })
  }
  showPassword = false;
}