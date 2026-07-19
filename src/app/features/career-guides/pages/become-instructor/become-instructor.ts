import { Component, ChangeDetectionStrategy, OnInit, DestroyRef, signal, inject } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { PLATFORM_ID } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, of } from 'rxjs';
import { SiteHeader } from '../../../../shared/site-header/site-header';
import { MobileBottomNav } from '../../../../shared/mobile-bottom-nav/mobile-bottom-nav';
import { Auth } from '../../../../core/services/auth';
import { UserService } from '../../../user/services/user-service';
import { MOCK_CATEGORIES } from '../../data/mock-experts';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
type ApplicationStatus = 'draft' | 'pending-review';

@Component({
  selector: 'app-become-instructor',
  standalone: true,
  imports: [CommonModule, RouterLink, SiteHeader, MobileBottomNav],
  templateUrl: './become-instructor.html',
  styleUrl: './become-instructor.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BecomeInstructor implements OnInit {
  private router = inject(Router);
  private auth = inject(Auth);
  private platformId = inject(PLATFORM_ID);
  private userService = inject(UserService);
  private destroyRef = inject(DestroyRef);

  readonly days = DAYS;
  readonly categories = MOCK_CATEGORIES;

  isLoggedIn(): boolean { return this.auth.isAuthorized(); }

  ngOnInit(): void {
    const userId = this.auth.userId();
    if (!userId) return;
    this.userService.getUserById(userId)
      .pipe(takeUntilDestroyed(this.destroyRef), catchError(() => of({ data: null })))
      .subscribe(res => {
        // Already-approved mentors don't need (and per spec, must not see)
        // the application form - bounce them straight to their dashboard.
        if (res.data?.isMentor) {
          this.router.navigate(['/career-guides/dashboard'], { queryParams: { notice: 'already-mentor' } });
        }
      });
  }

  goToLogin(): void {
    this.router.navigate(['/auth/login'], { queryParams: { returnUrl: '/career-guides/become-an-instructor' } });
  }
  goToRegister(): void {
    this.router.navigate(['/auth/register'], { queryParams: { returnUrl: '/career-guides/become-an-instructor' } });
  }

  // ── Form state (local prototype only - no backend to persist the
  // application to yet; submitting just flips this to 'pending-review'). ──
  status = signal<ApplicationStatus>('draft');

  photoFileName = signal('');
  resumeFileName = signal('');
  fullName = signal('');
  currentRole = signal('');
  currentCompany = signal('');
  yearsExperience = signal<number | null>(null);
  linkedin = signal('');
  github = signal('');
  portfolio = signal('');
  bio = signal('');
  reason = signal('');
  agreedToTerms = signal(false);

  skills = signal<string[]>([]);
  expertise = signal<string[]>([]);
  languages = signal<string[]>([]);
  teachingCategories = signal<string[]>([]);
  availableDays = signal<string[]>([]);
  availableTime = signal('');

  skillInput = signal('');
  expertiseInput = signal('');
  languageInput = signal('');

  onPhotoSelected(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    this.photoFileName.set(file?.name ?? '');
  }
  onResumeSelected(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    this.resumeFileName.set(file?.name ?? '');
  }

  private addTag(input: ReturnType<typeof signal<string>>, list: ReturnType<typeof signal<string[]>>): void {
    const value = input().trim();
    if (!value || list().includes(value)) { input.set(''); return; }
    list.update(v => [...v, value]);
    input.set('');
  }
  addSkill(): void { this.addTag(this.skillInput, this.skills); }
  addExpertise(): void { this.addTag(this.expertiseInput, this.expertise); }
  addLanguage(): void { this.addTag(this.languageInput, this.languages); }
  removeSkill(s: string): void { this.skills.update(v => v.filter(x => x !== s)); }
  removeExpertise(s: string): void { this.expertise.update(v => v.filter(x => x !== s)); }
  removeLanguage(s: string): void { this.languages.update(v => v.filter(x => x !== s)); }

  toggleCategory(name: string): void {
    this.teachingCategories.update(v => v.includes(name) ? v.filter(c => c !== name) : [...v, name]);
  }
  toggleDay(day: string): void {
    this.availableDays.update(v => v.includes(day) ? v.filter(d => d !== day) : [...v, day]);
  }

  isFormValid(): boolean {
    return !!(
      this.fullName().trim() &&
      this.currentRole().trim() &&
      this.yearsExperience() !== null &&
      this.skills().length &&
      this.bio().trim() &&
      this.teachingCategories().length &&
      this.availableDays().length &&
      this.agreedToTerms()
    );
  }

  submit(): void {
    if (!this.isFormValid()) return;
    this.status.set('pending-review');
    if (isPlatformBrowser(this.platformId)) window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}
