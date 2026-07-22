import { Component, ChangeDetectionStrategy, OnInit, DestroyRef, signal, inject } from '@angular/core';
import { CommonModule, DOCUMENT, isPlatformBrowser } from '@angular/common';
import { PLATFORM_ID } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Meta, Title } from '@angular/platform-browser';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, of } from 'rxjs';
import { SiteHeader } from '../../../../shared/site-header/site-header';
import { MobileBottomNav } from '../../../../shared/mobile-bottom-nav/mobile-bottom-nav';
import { Auth } from '../../../../core/services/auth';
import { UserService } from '../../../user/services/user-service';
import { MentorApplicationService } from '../../services/mentor-application.service';
import { MentorApplicationRecord } from '../../models/mentor-application.model';
import { MOCK_CATEGORIES } from '../../data/mock-experts';
import { environment } from '../../../../../environments/environment';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

@Component({
  selector: 'app-become-instructor',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, SiteHeader, MobileBottomNav],
  templateUrl: './become-instructor.html',
  styleUrl: './become-instructor.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BecomeInstructor implements OnInit {
  private router = inject(Router);
  private auth = inject(Auth);
  private platformId = inject(PLATFORM_ID);
  private userService = inject(UserService);
  private mentorApplicationService = inject(MentorApplicationService);
  private destroyRef = inject(DestroyRef);
  private meta = inject(Meta);
  private titleSvc = inject(Title);
  private document = inject(DOCUMENT);

  readonly days = DAYS;
  readonly categories = MOCK_CATEGORIES;

  isLoggedIn(): boolean { return this.auth.isAuthorized(); }

  // Real application state (replaces the old local-only prototype flag) -
  // see GET /api/mentor-applications/mine.
  isLoadingApplication = signal(true);
  existingApplication = signal<MentorApplicationRecord | null>(null);
  isSubmitting = signal(false);
  submitError = signal('');

  ngOnInit(): void {
    this.setMetaTags();

    const userId = this.auth.userId();
    if (!userId) { this.isLoadingApplication.set(false); return; }

    this.userService.getUserById(userId)
      .pipe(takeUntilDestroyed(this.destroyRef), catchError(() => of({ data: null })))
      .subscribe(res => {
        // Already-approved mentors don't need (and per spec, must not see)
        // the application form - bounce them straight to their dashboard.
        if (res.data?.isMentor) {
          this.router.navigate(['/career-guides/dashboard'], { queryParams: { notice: 'already-mentor' } });
        }
      });

    this.mentorApplicationService.mine()
      .pipe(takeUntilDestroyed(this.destroyRef), catchError(() => of({ data: null })))
      .subscribe(res => {
        this.existingApplication.set(res.data);
        this.isLoadingApplication.set(false);
      });
  }

  private setMetaTags(): void {
    const site = environment.siteUrl;
    const url = `${site}/career-guides/become-an-instructor`;
    const title = 'Become a Mentor - Share Your Expertise | ApnaInsights Career Guides';
    const description = 'Apply to become a verified career mentor on ApnaInsights - guide job-seekers with 1:1 sessions, resume reviews, and interview prep.';
    const image = `${site}/og-image-career-guides.png`;

    this.titleSvc.setTitle(title);
    this.meta.updateTag({ name: 'description', content: description });
    this.meta.updateTag({ name: 'robots', content: 'index, follow' });

    this.meta.updateTag({ property: 'og:type', content: 'website' });
    this.meta.updateTag({ property: 'og:title', content: title });
    this.meta.updateTag({ property: 'og:description', content: description });
    this.meta.updateTag({ property: 'og:url', content: url });
    this.meta.updateTag({ property: 'og:site_name', content: 'ApnaInsights' });
    this.meta.updateTag({ property: 'og:image', content: image });
    this.meta.updateTag({ property: 'og:image:width', content: '1200' });
    this.meta.updateTag({ property: 'og:image:height', content: '630' });
    this.meta.updateTag({ property: 'og:image:alt', content: title });

    this.meta.updateTag({ name: 'twitter:card', content: 'summary_large_image' });
    this.meta.updateTag({ name: 'twitter:title', content: title });
    this.meta.updateTag({ name: 'twitter:description', content: description });
    this.meta.updateTag({ name: 'twitter:image', content: image });

    let canonical = this.document.querySelector('link[rel="canonical"]') as HTMLLinkElement;
    if (!canonical) {
      canonical = this.document.createElement('link');
      canonical.setAttribute('rel', 'canonical');
      this.document.head.appendChild(canonical);
    }
    canonical.setAttribute('href', url);
  }

  /** Rejected applicants can fill out and submit the form again. */
  startNewApplication(): void {
    this.existingApplication.set(null);
    this.submitError.set('');
  }

  goToLogin(): void {
    this.router.navigate(['/auth/login'], { queryParams: { returnUrl: '/career-guides/become-an-instructor' } });
  }
  goToRegister(): void {
    this.router.navigate(['/auth/register'], { queryParams: { returnUrl: '/career-guides/become-an-instructor' } });
  }

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
    if (!this.isFormValid() || this.isSubmitting()) return;

    this.isSubmitting.set(true);
    this.submitError.set('');
    this.mentorApplicationService.submit({
      fullName: this.fullName().trim(),
      currentRole: this.currentRole().trim(),
      currentCompany: this.currentCompany().trim(),
      yearsExperience: this.yearsExperience() ?? 0,
      linkedin: this.linkedin().trim(),
      github: this.github().trim(),
      portfolio: this.portfolio().trim(),
      bio: this.bio().trim(),
      reason: this.reason().trim(),
      skills: this.skills(),
      expertise: this.expertise(),
      languages: this.languages(),
      teachingCategories: this.teachingCategories(),
      availableDays: this.availableDays(),
      availableTime: this.availableTime().trim(),
      photoFileName: this.photoFileName(),
      resumeFileName: this.resumeFileName(),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.isSubmitting.set(false);
          this.existingApplication.set(res.data);
          if (isPlatformBrowser(this.platformId)) window.scrollTo({ top: 0, behavior: 'smooth' });
        },
        error: (err) => {
          this.isSubmitting.set(false);
          this.submitError.set(err?.error?.message ?? 'Could not submit your application. Please try again.');
        },
      });
  }
}
