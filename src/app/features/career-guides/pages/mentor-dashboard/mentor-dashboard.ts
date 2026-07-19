import { Component, ChangeDetectionStrategy, OnInit, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, of } from 'rxjs';
import { SiteHeader } from '../../../../shared/site-header/site-header';
import { MobileBottomNav } from '../../../../shared/mobile-bottom-nav/mobile-bottom-nav';
import { CallbackRequestService } from '../../services/callback-request.service';
import { CallbackRequestRecord } from '../../models/callback-request.model';
import { Auth } from '../../../../core/services/auth';
import { UserService } from '../../../user/services/user-service';

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
  imports: [CommonModule, RouterLink, SiteHeader, MobileBottomNav],
  templateUrl: './mentor-dashboard.html',
  styleUrl: './mentor-dashboard.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MentorDashboard implements OnInit {
  private callbackRequests = inject(CallbackRequestService);
  private auth = inject(Auth);
  private userService = inject(UserService);
  private destroyRef = inject(DestroyRef);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  mentorName = signal('');
  mentorSlug = signal('');
  isLoading = signal(true);
  error = signal('');
  requests = signal<CallbackRequestRecord[]>([]);

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
}
