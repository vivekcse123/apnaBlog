import { Component, ChangeDetectionStrategy, OnInit, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, of } from 'rxjs';
import { SiteHeader } from '../../../../shared/site-header/site-header';
import { MobileBottomNav } from '../../../../shared/mobile-bottom-nav/mobile-bottom-nav';
import { CallbackRequestService } from '../../services/callback-request.service';
import { CallbackRequestRecord } from '../../models/callback-request.model';
import { Auth } from '../../../../core/services/auth';
import { UserService } from '../../../user/services/user-service';
import { MentorProfileService } from '../../services/mentor-profile.service';
import { MentorProfileRecord } from '../../models/mentor-profile.model';
import { ExpertTimelineEntry } from '../../models/expert.model';

// Mirrors the caps enforced server-side in mentor-profile.model.js /
// mentor-profile.router.js - validated here too so a mentor finds out
// immediately instead of after a round trip to the backend.
const CAPS = {
  title: 120, company: 120, bio: 1000, responseTime: 80,
  listItem: { skills: 40, languages: 40, certifications: 120 },
  maxListItems: 20,
  maxTimelineEntries: 10,
  timelineField: 120,
  bioMinLength: 10,
};

const emptyProfile = (): MentorProfileRecord => ({
  title: '', company: '', bio: '', responseTime: '',
  skills: [], languages: [], certifications: [],
  education: [], experience: [],
});

const todayStr = () => new Date().toISOString().slice(0, 10);

// The mentor's default landing page (see career-guides route guard in
// app.routes.ts, which redirects logged-in mentors here instead of the
// public marketplace). Everything on this page is real data from
// /api/callback-requests/for-mentor - no analytics (profile views, response
// rate/time), roadmaps, or availability calendar, since none of that is
// tracked anywhere yet.
@Component({
  selector: 'app-mentor-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, SiteHeader, MobileBottomNav],
  templateUrl: './mentor-dashboard.html',
  styleUrl: './mentor-dashboard.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MentorDashboard implements OnInit {
  private callbackRequests = inject(CallbackRequestService);
  private auth = inject(Auth);
  private userService = inject(UserService);
  private mentorProfileService = inject(MentorProfileService);
  private destroyRef = inject(DestroyRef);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  mentorName = signal('');
  mentorSlug = signal('');
  isLoading = signal(true);
  error = signal('');
  requests = signal<CallbackRequestRecord[]>([]);

  // ── My Profile (real, backend-persisted - overlays the marketplace's
  //    MOCK_EXPERTS base, see expert-profile.ts's displayExpert()) ──
  profile = signal<MentorProfileRecord>(emptyProfile());
  isEditingProfile = signal(false);
  isSavingProfile = signal(false);
  profileSaveError = signal('');
  profileSaved = signal(false);

  // Plain editable copies bound via ngModel - arrays/lists edited as
  // comma-separated text (matches this codebase's simple-input convention),
  // education/experience as repeatable title/org/period rows.
  editTitle = '';
  editCompany = '';
  editBio = '';
  editResponseTime = '';
  editSkills = '';
  editLanguages = '';
  editCertifications = '';
  editEducation: ExpertTimelineEntry[] = [];
  editExperience: ExpertTimelineEntry[] = [];

  // ── Availability (whole-day blackout dates) - see GET/POST/DELETE
  //    /api/mentor-profile/:id/blocked-dates. Sorted ascending for display;
  //    the backend is the real source of truth (POST /callback-requests
  //    also rejects bookings on a blocked date), this is just management UI. ──
  blockedDates = computed(() => [...(this.profile().blockedDates ?? [])].sort());
  newBlockedDate = signal(todayStr());
  isBlockingDate = signal(false);
  blockDateError = signal('');
  private removingDate = signal<string | null>(null);
  isRemovingDate(date: string): boolean { return this.removingDate() === date; }
  todayForMin = todayStr();

  // Set when become-instructor.ts redirects an already-approved mentor here.
  showAlreadyMentorNotice = signal(this.route.snapshot.queryParamMap.get('notice') === 'already-mentor');
  dismissNotice(): void { this.showAlreadyMentorNotice.set(false); }

  // Mentor Requests lives under the user module (/user/:id/...), not under
  // /career-guides - a plain '/career-guides/mentor-requests' link falls
  // through to the dynamic /career-guides/:expertId route instead.
  mentorRequestsLink = computed(() => `/user/${this.auth.userId()}/career-guides/mentor-requests`);

  today = computed(() => this.requests().filter(r => r.preferredDate === todayStr() && (r.status === 'accepted' || r.status === 'scheduled')));
  upcoming = computed(() => this.requests().filter(r => r.preferredDate > todayStr() && (r.status === 'accepted' || r.status === 'scheduled')));
  pending = computed(() => this.requests().filter(r => r.status === 'pending'));
  completed = computed(() => this.requests().filter(r => r.status === 'completed'));

  // Real feedback left by requesters on completed sessions - most recent first.
  recentReviews = computed(() =>
    this.requests()
      .filter(r => r.feedback?.rating)
      .sort((a, b) => (b.feedback!.submittedAt).localeCompare(a.feedback!.submittedAt))
      .slice(0, 5)
  );
  private ratedRequests = computed(() => this.requests().filter(r => r.feedback?.rating));
  ratedCount = computed(() => this.ratedRequests().length);
  avgRating = computed(() => {
    const rated = this.ratedRequests();
    if (!rated.length) return null;
    return Math.round((rated.reduce((sum, r) => sum + r.feedback!.rating, 0) / rated.length) * 10) / 10;
  });

  constructor() {
    effect(() => {
      this.callbackRequests.liveTick();
      if (!untracked(this.isLoading)) this.load();
    });
  }

  ngOnInit(): void {
    const userId = this.auth.userId();
    if (!userId) { this.router.navigate(['/auth/login'], { queryParams: { returnUrl: '/career-guides/dashboard' } }); return; }

    this.userService.getUserById(userId)
      .pipe(takeUntilDestroyed(this.destroyRef), catchError(() => of({ data: null })))
      .subscribe(res => {
        if (!res.data?.isMentor) { this.router.navigate(['/career-guides']); return; }
        this.mentorName.set(res.data.name ?? '');
        this.mentorSlug.set(res.data.mentorSlug ?? '');
      });

    this.mentorProfileService.getByUserId(userId)
      .pipe(takeUntilDestroyed(this.destroyRef), catchError(() => of({ data: null })))
      .subscribe(res => this.profile.set(res.data ?? emptyProfile()));

    this.callbackRequests.ensureLive();
    this.load();
  }

  load(): void {
    this.isLoading.set(true);
    this.error.set('');
    this.callbackRequests.forMentor().subscribe({
      next: (res) => { this.requests.set(res.data ?? []); this.isLoading.set(false); },
      error: (err) => {
        this.error.set(err?.error?.message ?? 'Failed to load your dashboard.');
        this.isLoading.set(false);
      },
    });
  }

  trackById(_i: number, r: CallbackRequestRecord): string { return r._id; }

  startEditingProfile(): void {
    const p = this.profile();
    this.editTitle = p.title;
    this.editCompany = p.company;
    this.editBio = p.bio;
    this.editResponseTime = p.responseTime;
    this.editSkills = p.skills.join(', ');
    this.editLanguages = p.languages.join(', ');
    this.editCertifications = p.certifications.join(', ');
    this.editEducation = p.education.map(e => ({ ...e }));
    this.editExperience = p.experience.map(e => ({ ...e }));
    this.profileSaveError.set('');
    this.profileSaved.set(false);
    this.isEditingProfile.set(true);
  }

  cancelEditingProfile(): void {
    this.isEditingProfile.set(false);
  }

  addEducationRow(): void { this.editEducation = [...this.editEducation, { title: '', org: '', period: '' }]; }
  removeEducationRow(i: number): void { this.editEducation = this.editEducation.filter((_, idx) => idx !== i); }
  addExperienceRow(): void { this.editExperience = [...this.editExperience, { title: '', org: '', period: '' }]; }
  removeExperienceRow(i: number): void { this.editExperience = this.editExperience.filter((_, idx) => idx !== i); }

  private splitList(value: string): string[] {
    return value.split(',').map(s => s.trim()).filter(Boolean);
  }

  // Returns the first validation problem found, or null if the form is
  // clean. Checked before every save - a row a mentor half-fills in (e.g.
  // degree + school but no dates) used to just vanish silently on save;
  // now it blocks submission with a message naming the row instead.
  private validateProfile(payload: MentorProfileRecord): string | null {
    if (!payload.title) return 'Title is required.';
    if (payload.title.length > CAPS.title) return `Title must be ${CAPS.title} characters or fewer.`;
    if (payload.company.length > CAPS.company) return `Company must be ${CAPS.company} characters or fewer.`;
    if (!payload.bio || payload.bio.length < CAPS.bioMinLength) return `Bio must be at least ${CAPS.bioMinLength} characters.`;
    if (payload.bio.length > CAPS.bio) return `Bio must be ${CAPS.bio} characters or fewer.`;
    if (payload.responseTime.length > CAPS.responseTime) return `"Usually replies within" must be ${CAPS.responseTime} characters or fewer.`;

    for (const [key, items] of Object.entries({ skills: payload.skills, languages: payload.languages, certifications: payload.certifications }) as [keyof typeof CAPS.listItem, string[]][]) {
      if (items.length > CAPS.maxListItems) return `You can list at most ${CAPS.maxListItems} ${key}.`;
      const tooLong = items.find(i => i.length > CAPS.listItem[key]);
      if (tooLong) return `"${tooLong}" is too long for ${key} (max ${CAPS.listItem[key]} characters).`;
    }

    for (const [label, rows] of [['Education', this.editEducation], ['Experience', this.editExperience]] as const) {
      if (rows.length > CAPS.maxTimelineEntries) return `You can list at most ${CAPS.maxTimelineEntries} ${label.toLowerCase()} entries.`;
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const filledCount = [r.title.trim(), r.org.trim(), r.period.trim()].filter(Boolean).length;
        if (filledCount > 0 && filledCount < 3) {
          return `${label} row ${i + 1} is missing a field - fill in all three (or remove the row).`;
        }
        if (r.title.length > CAPS.timelineField || r.org.length > CAPS.timelineField) {
          return `${label} row ${i + 1}: fields must be ${CAPS.timelineField} characters or fewer.`;
        }
      }
    }

    return null;
  }

  saveProfile(): void {
    const userId = this.auth.userId();
    if (!userId) return;

    const payload: MentorProfileRecord = {
      title: this.editTitle.trim(),
      company: this.editCompany.trim(),
      bio: this.editBio.trim(),
      responseTime: this.editResponseTime.trim(),
      skills: this.splitList(this.editSkills),
      languages: this.splitList(this.editLanguages),
      certifications: this.splitList(this.editCertifications),
      education: this.editEducation.filter(e => e.title.trim() && e.org.trim() && e.period.trim()),
      experience: this.editExperience.filter(e => e.title.trim() && e.org.trim() && e.period.trim()),
    };

    const validationError = this.validateProfile(payload);
    if (validationError) {
      this.profileSaveError.set(validationError);
      return;
    }

    this.isSavingProfile.set(true);
    this.profileSaveError.set('');
    this.mentorProfileService.update(userId, payload)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.profile.set(res.data);
          this.isSavingProfile.set(false);
          this.isEditingProfile.set(false);
          this.profileSaved.set(true);
        },
        error: (err) => {
          this.isSavingProfile.set(false);
          this.profileSaveError.set(err?.error?.message ?? 'Failed to save your profile.');
        },
      });
  }

  addBlockedDate(): void {
    const userId = this.auth.userId();
    const date = this.newBlockedDate();
    if (!userId || !date || this.isBlockingDate()) return;
    if (this.blockedDates().includes(date)) {
      this.blockDateError.set('That date is already marked unavailable.');
      return;
    }

    this.isBlockingDate.set(true);
    this.blockDateError.set('');
    this.mentorProfileService.addBlockedDate(userId, date)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.profile.set(res.data);
          this.isBlockingDate.set(false);
        },
        error: (err) => {
          this.isBlockingDate.set(false);
          this.blockDateError.set(err?.error?.message ?? 'Could not mark that date unavailable.');
        },
      });
  }

  removeBlockedDate(date: string): void {
    const userId = this.auth.userId();
    if (!userId || this.removingDate()) return;
    this.removingDate.set(date);
    this.mentorProfileService.removeBlockedDate(userId, date)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.profile.set(res.data);
          this.removingDate.set(null);
        },
        error: () => {
          this.removingDate.set(null);
        },
      });
  }
}
