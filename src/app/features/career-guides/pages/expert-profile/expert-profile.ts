import { Component, ChangeDetectionStrategy, OnInit, DestroyRef, signal, computed, inject, effect, untracked, PLATFORM_ID } from '@angular/core';
import { CommonModule, DOCUMENT, isPlatformBrowser } from '@angular/common';
import { Meta, Title } from '@angular/platform-browser';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, of, timeout, Observable } from 'rxjs';
import { environment } from '../../../../../environments/environment';
import { SiteHeader } from '../../../../shared/site-header/site-header';
import { MobileBottomNav } from '../../../../shared/mobile-bottom-nav/mobile-bottom-nav';
import { Auth } from '../../../../core/services/auth';
import { ToastService } from '../../../../core/services/toast.service';
import { MOCK_EXPERTS } from '../../data/mock-experts';
import { Expert } from '../../models/expert.model';
import { CallbackRequestService, ExpertReview, BookedSlot } from '../../services/callback-request.service';
import { CallbackRequestRecord } from '../../models/callback-request.model';
import { UserService } from '../../../user/services/user-service';
import { PremiumPurchase } from '../../../../shared/premium-purchase/premium-purchase';
import { MentorProfileService } from '../../services/mentor-profile.service';
import { MentorAvailabilityStatus, MentorProfileRecord } from '../../models/mentor-profile.model';
import { DecodeEntitiesPipe } from '../../../../shared/pipes/decode-entities-pipe';

const DURATIONS = [15, 30, 45, 60] as const;
const TOPICS = ['Angular', 'Interview', 'Resume', 'Career Switch', 'Salary Discussion', 'Technical Guidance'] as const;
type GatedAction = 'follow' | 'message' | 'book' | 'callback';
const PENDING_INTENT_KEY = 'cg_pending_intent';
// Mirrors FREE_SESSION_BLOCKING_STATUSES in blogApp's callback-request.router.js -
// rejected/cancelled/expired requests don't count as a used free session.
const FREE_SESSION_BLOCKING_STATUSES = ['pending', 'accepted', 'scheduled', 'completed'];

@Component({
  selector: 'app-expert-profile',
  standalone: true,
  imports: [CommonModule, RouterLink, SiteHeader, MobileBottomNav, PremiumPurchase, DecodeEntitiesPipe],
  templateUrl: './expert-profile.html',
  styleUrl: './expert-profile.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExpertProfile implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private auth = inject(Auth);
  private platformId = inject(PLATFORM_ID);
  private callbackRequests = inject(CallbackRequestService);
  private userService = inject(UserService);
  private mentorProfileService = inject(MentorProfileService);
  private destroyRef = inject(DestroyRef);
  private toast = inject(ToastService);
  private meta = inject(Meta);
  private title = inject(Title);
  private document = inject(DOCUMENT);

  // Base data reads from the static MOCK_EXPERTS array the listing page also
  // uses. Real, mentor-edited fields (see mentor-dashboard.ts's profile
  // editor) overlay on top via realProfile()/displayExpert() below.
  private expertId = signal<string>(this.route.snapshot.paramMap.get('expertId') ?? '');
  expert = computed<Expert | undefined>(() => MOCK_EXPERTS.find(e => e.slug === this.expertId()));

  // Real backend-persisted profile override, if the mentor has saved one
  // (see GET /api/mentor-profile/by-slug/:slug). Null until it loads, or if
  // the mentor hasn't edited anything yet - both cases fall back to the
  // mock base untouched.
  private realProfile = signal<MentorProfileRecord | null>(null);
  displayExpert = computed<Expert | undefined>(() => {
    const base = this.expert();
    if (!base) return undefined;
    const overlay = this.realProfile();
    if (!overlay) return base;
    return {
      ...base,
      title:          overlay.title || base.title,
      company:        overlay.company || base.company,
      bio:            overlay.bio || base.bio,
      responseTime:   overlay.responseTime || base.responseTime,
      yearsExperience: overlay.yearsExperience || base.yearsExperience,
      skills:         overlay.skills?.length ? overlay.skills : base.skills,
      languages:      overlay.languages?.length ? overlay.languages : base.languages,
      certifications: overlay.certifications?.length ? overlay.certifications : base.certifications,
      education:      overlay.education?.length ? overlay.education : base.education,
      // Current role(s) float to the top - same ordering as mentor-dashboard.ts's
      // sortedExperienceView() so the dashboard preview matches what visitors see.
      experience:     (overlay.experience?.length ? overlay.experience : base.experience)
        .slice().sort((a, b) => (b.current ? 1 : 0) - (a.current ? 1 : 0)),
    };
  });

  // Live Available/Busy/Unavailable status - defaults to 'available' to
  // match the backend schema default when no override has been saved yet.
  availabilityStatus = computed<MentorAvailabilityStatus>(() => this.realProfile()?.availabilityStatus ?? 'available');

  constructor() {
    // Kept live via the same Socket.IO connection callback-requests already
    // uses (see CallbackRequestService) - mentor-profile.router.js's PATCH
    // /availability broadcasts to every connected client, so any visitor
    // sitting on this page sees the badge/CTA state flip without reloading.
    effect(() => {
      const update = this.callbackRequests.lastAvailabilityUpdate();
      const slug = untracked(this.expertId);
      if (!update || update.mentorSlug !== slug) return;
      // Refetch rather than patch in-memory - realProfile() may still be
      // null here (mentor toggled status before ever saving a profile via
      // PUT, which the availability PATCH upserts independently of).
      this.ssrBound(this.mentorProfileService.getBySlug(slug))
        .pipe(takeUntilDestroyed(this.destroyRef), catchError(() => of({ data: null })))
        .subscribe(res => this.realProfile.set(res.data));
    });
  }

  readonly durations = DURATIONS;
  readonly topics = TOPICS;

  // Real reviews from actual submitted session feedback (see
  // GET /api/callback-requests/reviews/:expertSlug) - replaces the fabricated
  // rating/reviewCount/reviews that used to live on the mock Expert record.
  realReviews = signal<ExpertReview[]>([]);
  realReviewCount = computed(() => this.realReviews().length);
  realAvgRating = computed<number | null>(() => {
    const list = this.realReviews();
    if (!list.length) return null;
    return Math.round((list.reduce((sum, r) => sum + r.rating, 0) / list.length) * 10) / 10;
  });

  // Sort/pagination for the Reviews section - client-side since
  // reviewsFor() already returns the full (small - tens per mentor at most,
  // gated by the 1-free-session cap) list unpaginated.
  reviewSort = signal<'latest' | 'highest' | 'lowest'>('latest');
  reviewsShown = signal(5);
  private readonly REVIEWS_PAGE_SIZE = 5;

  sortedReviews = computed(() => {
    const list = [...this.realReviews()];
    const sort = this.reviewSort();
    if (sort === 'highest') return list.sort((a, b) => b.rating - a.rating);
    if (sort === 'lowest') return list.sort((a, b) => a.rating - b.rating);
    return list.sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
  });
  visibleReviews = computed(() => this.sortedReviews().slice(0, this.reviewsShown()));
  hasMoreReviews = computed(() => this.reviewsShown() < this.sortedReviews().length);

  setReviewSort(sort: 'latest' | 'highest' | 'lowest'): void {
    this.reviewSort.set(sort);
    this.reviewsShown.set(this.REVIEWS_PAGE_SIZE);
  }
  showMoreReviews(): void { this.reviewsShown.update(n => n + this.REVIEWS_PAGE_SIZE); }

  // Count + percentage of reviews at each star rating (5 first), for the
  // distribution bars shown next to the average-rating summary.
  ratingDistribution = computed(() => {
    const list = this.realReviews();
    const total = list.length;
    const counts = [5, 4, 3, 2, 1].map(star => list.filter(r => Math.round(r.rating) === star).length);
    return [5, 4, 3, 2, 1].map((star, i) => ({
      star,
      count: counts[i],
      pct: total ? Math.round((counts[i] / total) * 100) : 0,
    }));
  });

  // Real "Sessions Guided" count - works for every expert since callback
  // requests are stored by plain expertSlug, not tied to a real account.
  sessionsGuided = signal(0);

  // Real mentor account backing this slug, if one exists yet (see
  // GET /api/user/by-mentor-slug/:slug). Follow only works when this is set -
  // there's no real user to follow for the still-mock-only experts. Also
  // used to link the Articles stat to this mentor's /author/:id page.
  mentorUserId = signal<string | null>(null);
  hasRealAccount = computed(() => !!this.mentorUserId());

  // True when the logged-in visitor IS this mentor - Follow/Message/Book/
  // Request Callback don't make sense on your own profile, so the hero
  // actions swap for a single "Go to Dashboard" link instead.
  isOwnProfile = computed(() => {
    const mentorId = this.mentorUserId();
    return !!mentorId && this.auth.isAuthorized() && this.auth.userId() === mentorId;
  });

  // Only the first mentorship session is free, platform-wide (see the same
  // rule enforced server-side in POST /api/callback-requests). Checked
  // proactively here so the dialog can explain itself instead of just
  // failing on submit. usedFreeSessionRaw and isPremiumUser resolve from two
  // separate async fetches (callback history vs. the user record) that can
  // land in either order - hasUsedFreeSession is derived as a computed so it
  // always reflects both once they're both in, instead of a race where
  // whichever subscribe fires last overwrites the other's contribution.
  private usedFreeSessionRaw = signal(false);
  private isPremiumUser      = signal(false);
  hasUsedFreeSession = computed(() => this.usedFreeSessionRaw() && !this.isPremiumUser());

  // ── Upgrade to Premium (Razorpay one-time purchase via the shared stepper
  // modal, see shared/premium-purchase/) ──
  showPremiumModal = signal(false);

  onPremiumPurchased(): void {
    this.showPremiumModal.set(false);
    // Premium removes the free-session cap entirely - this is what flips
    // hasUsedFreeSession back to false and re-enables the Message/Book/
    // Callback forms below.
    this.isPremiumUser.set(true);
  }

  // ── Auth gate: Follow / Message / Book / Request Callback all require a
  // logged-in user. Not-logged-in clicks stash the intended action + this
  // expert's slug in sessionStorage, then send the visitor to login/register
  // with a returnUrl back here - resumePendingIntent() below re-fires the
  // action automatically once they're back and authorized. No backend yet,
  // so "pending action" is just resumed client-side, not queued server-side. ──
  showLoginModal = signal(false);
  private pendingAction: GatedAction | null = null;

  private requireAuth(action: GatedAction, run: () => void): void {
    if (this.auth.isAuthorized()) { run(); return; }
    this.pendingAction = action;
    this.showLoginModal.set(true);
  }

  dismissLoginModal(): void { this.showLoginModal.set(false); this.pendingAction = null; }

  private storePendingIntent(): void {
    if (!isPlatformBrowser(this.platformId) || !this.pendingAction) return;
    const expert = this.expert();
    if (!expert) return;
    sessionStorage.setItem(PENDING_INTENT_KEY, JSON.stringify({ slug: expert.slug, action: this.pendingAction }));
  }

  goToLogin(): void {
    this.storePendingIntent();
    this.router.navigate(['/auth/login'], { queryParams: { returnUrl: this.router.url } });
  }

  goToRegister(): void {
    this.storePendingIntent();
    this.router.navigate(['/auth/register'], { queryParams: { returnUrl: this.router.url } });
  }

  private resumePendingIntent(): void {
    if (!isPlatformBrowser(this.platformId) || !this.auth.isAuthorized()) return;
    const raw = sessionStorage.getItem(PENDING_INTENT_KEY);
    if (!raw) return;
    sessionStorage.removeItem(PENDING_INTENT_KEY);
    try {
      const { slug, action } = JSON.parse(raw) as { slug: string; action: GatedAction };
      if (slug !== this.expert()?.slug) return;
      if (action === 'follow') this.toggleFollow();
      else if (action === 'message') this.openMessageBox();
      else if (action === 'book') this.openBookDialog();
      else if (action === 'callback') this.openCallbackDialog();
    } catch { /* malformed/stale intent - ignore */ }
  }

  // This page now renders in RenderMode.Server (per-request, not prerendered -
  // see app.routes.server.ts), so a cold/slow backend blocks the actual page
  // load instead of just the build. Cap these SSR-only at 8s (same idea as
  // blog-detail's 25s SSR cap) - the browser gets no such limit since a slow
  // client-side refresh is fine.
  private ssrBound<T>(obs: Observable<T>): Observable<T> {
    return isPlatformBrowser(this.platformId) ? obs : obs.pipe(timeout(8000));
  }

  ngOnInit(): void {
    this.setMetaTags();
    this.resumePendingIntent();
    const slug = this.expertId();
    if (!slug) return;

    this.callbackRequests.ensureLive();

    this.ssrBound(this.mentorProfileService.getBySlug(slug))
      .pipe(takeUntilDestroyed(this.destroyRef), catchError(() => of({ data: null })))
      .subscribe(res => this.realProfile.set(res.data));

    this.ssrBound(this.callbackRequests.reviewsFor(slug))
      .pipe(takeUntilDestroyed(this.destroyRef), catchError(() => of({ data: [] as ExpertReview[] })))
      .subscribe(res => this.realReviews.set(res.data ?? []));

    this.ssrBound(this.callbackRequests.statsFor(slug))
      .pipe(takeUntilDestroyed(this.destroyRef), catchError(() => of({ data: { completedSessions: 0 } })))
      .subscribe(res => this.sessionsGuided.set(res.data?.completedSessions ?? 0));

    if (this.auth.isAuthorized()) {
      this.ssrBound(this.callbackRequests.mine())
        .pipe(takeUntilDestroyed(this.destroyRef), catchError(() => of({ data: [] as CallbackRequestRecord[] })))
        .subscribe(res => this.usedFreeSessionRaw.set(
          (res.data ?? []).some(r => FREE_SESSION_BLOCKING_STATUSES.includes(r.status))
        ));

      const uid = this.auth.userId();
      if (uid) {
        this.ssrBound(this.userService.getUserById(uid))
          .pipe(takeUntilDestroyed(this.destroyRef), catchError(() => of({ data: undefined })))
          .subscribe(res => this.isPremiumUser.set(!!(res.data as any)?.isPremium));
      }
    }

    this.ssrBound(this.userService.getUserByMentorSlug(slug))
      .pipe(takeUntilDestroyed(this.destroyRef), catchError(() => of({ data: undefined })))
      .subscribe(res => {
        const mentorId = res.data?._id ?? null;
        this.mentorUserId.set(mentorId);
        if (!mentorId) return;
        this.ssrBound(this.userService.getUserById(mentorId))
          .pipe(takeUntilDestroyed(this.destroyRef), catchError(() => of(null)))
          .subscribe(userRes => {
            if (!userRes) return;
            this.followersCount.set((userRes as any).followersCount ?? 0);
            this.isFollowing.set((userRes as any).isFollowing ?? false);
            const avatar = (userRes as any).data?.avatar;
            if (avatar) this.setOgImageFromAvatar(avatar);
          });
      });
  }

  private setMetaTags(): void {
    const e = this.expert();
    if (!e) return;
    const site = environment.siteUrl;
    const url = `${site}/career-guides/${e.slug}`;
    const pageTitle = `${e.name} - ${e.title} | ApnaInsights Career Guides`;
    const bio = e.bio?.trim();
    const description = bio
      ? (bio.length > 200 ? bio.slice(0, 197) + '...' : bio)
      : `Connect with ${e.name}, ${e.title} at ${e.company}, for 1:1 career guidance on ApnaInsights.`;
    // Real experts don't have an uploaded photo (avatarInitial/avatarColor are
    // just a colored letter, not shareable) - default to the Career Guides
    // page's own image until/unless the mentor's real account has an avatar
    // (see setOgImageFromAvatar(), called once getUserById resolves below).
    const image = `${site}/og-image-career-guides.png`;

    this.title.setTitle(pageTitle);
    this.meta.updateTag({ name: 'description', content: description });
    this.meta.updateTag({ name: 'robots', content: 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1' });

    this.meta.updateTag({ property: 'og:type', content: 'profile' });
    this.meta.updateTag({ property: 'og:title', content: pageTitle });
    this.meta.updateTag({ property: 'og:description', content: description });
    this.meta.updateTag({ property: 'og:url', content: url });
    this.meta.updateTag({ property: 'og:site_name', content: 'ApnaInsights' });
    this.meta.updateTag({ property: 'og:image', content: image });
    this.meta.updateTag({ property: 'og:image:width', content: '1200' });
    this.meta.updateTag({ property: 'og:image:height', content: '630' });
    this.meta.updateTag({ property: 'og:image:alt', content: pageTitle });
    this.meta.updateTag({ property: 'og:locale', content: 'en_IN' });

    this.meta.updateTag({ name: 'twitter:card', content: 'summary_large_image' });
    this.meta.updateTag({ name: 'twitter:title', content: pageTitle });
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

  private setOgImageFromAvatar(avatarUrl: string): void {
    this.meta.updateTag({ property: 'og:image', content: avatarUrl });
    this.meta.updateTag({ name: 'twitter:image', content: avatarUrl });
  }

  // ── Follow (real, only when this expert has a real mentor account) ──
  followersCount = signal(0);
  isFollowing = signal(false);
  followLoading = signal(false);

  private toggleFollow(): void {
    const mentorId = this.mentorUserId();
    if (!mentorId || this.followLoading()) return;
    this.followLoading.set(true);
    const action$ = this.isFollowing() ? this.userService.unfollowUser(mentorId) : this.userService.followUser(mentorId);
    action$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (res) => {
        this.followersCount.set(res.data?.followersCount ?? this.followersCount());
        this.isFollowing.set(res.data?.isFollowing ?? !this.isFollowing());
        this.followLoading.set(false);
        this.userService.invalidate(mentorId);
      },
      error: () => this.followLoading.set(false),
    });
  }
  onFollowClick(): void {
    if (!this.hasRealAccount()) return;
    this.requireAuth('follow', () => this.toggleFollow());
  }

  // ── Message composer (local-only - no messaging backend yet) ──
  showMessageBox = signal(false);
  messageText = signal('');
  messageSent = signal(false);
  private openMessageBox(): void { this.showMessageBox.set(true); this.messageSent.set(false); }
  onMessageClick(): void { this.requireAuth('message', () => this.openMessageBox()); }
  sendMessage(): void {
    if (!this.messageText().trim()) return;
    this.messageSent.set(true);
    this.messageText.set('');
  }

  // ── Book session dialog - backed by the real /api/callback-requests API,
  // submitted with type:'booking' (see models/callback-request.model.js) so
  // it shares the same collection, admin visibility, and 1-free-session cap
  // as Request Callback instead of being tracked separately. ──
  showBookDialog = signal(false);
  bookDuration = signal<number>(30);
  bookTopic = signal<string>(TOPICS[0]);
  bookDate = signal('');
  bookTime = signal('');
  bookPhone = signal('');
  bookNotes = signal('');
  bookSubmitted = signal(false);
  bookSubmitting = signal(false);
  bookError = signal('');

  // ── Slot calendar (green/available, red/booked) - see GET
  //    /api/callback-requests/booked-slots/:slug. Fixed 9AM-8PM/30-min grid;
  //    no per-mentor working-hours data exists yet, so this is one shared
  //    default window rather than something mentors configure. The backend's
  //    POST /callback-requests conflict check is the real source of truth -
  //    this is UX sugar to avoid a doomed submit in the common case. ──
  private bookedSlots = signal<BookedSlot[]>([]);

  // Whole-day blackout dates the mentor has set (see mentor-dashboard.ts's
  // Availability section) - sourced from the same realProfile() overlay
  // already fetched for bio/skills/etc. The backend's POST
  // /callback-requests check is the actual enforcement; this just avoids
  // showing a slot grid for a day that's guaranteed to fail on submit.
  isBookDateBlocked = computed<boolean>(() => {
    const date = this.bookDate();
    return !!date && !!this.realProfile()?.blockedDates?.includes(date);
  });

  private static readonly SLOT_START_MIN = 9 * 60;
  private static readonly SLOT_END_MIN = 20 * 60;
  private static readonly SLOT_STEP_MIN = 30;

  slotTimes = computed<string[]>(() => {
    const out: string[] = [];
    for (let m = ExpertProfile.SLOT_START_MIN; m < ExpertProfile.SLOT_END_MIN; m += ExpertProfile.SLOT_STEP_MIN) {
      out.push(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
    }
    return out;
  });

  private toMinutes(hhmm: string): number {
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + m;
  }
  private overlapsRange(aStart: number, aDuration: number, bStart: number, bDuration: number): boolean {
    return aStart < bStart + bDuration && bStart < aStart + aDuration;
  }

  // Depends on bookDuration() too, not just the date - a longer duration can
  // turn an otherwise-free slot red because it would now run into a
  // neighboring booking.
  isSlotBooked(time: string): boolean {
    const start = this.toMinutes(time);
    const dur = this.bookDuration();
    return this.bookedSlots().some(s => this.overlapsRange(start, dur, this.toMinutes(s.preferredTime), s.duration));
  }

  selectBookSlot(time: string): void {
    if (this.isSlotBooked(time)) return;
    this.bookTime.set(time);
  }

  private refreshBookedSlots(): void {
    const date = this.bookDate();
    const slug = this.expertId();
    if (!date || !slug) return;
    this.callbackRequests.bookedSlotsFor(slug, date)
      .pipe(catchError(() => of({ status: 200, data: [] as BookedSlot[] })))
      .subscribe(res => this.bookedSlots.set(res.data));
  }

  // Field initializers run in the component's injection context, so effect()
  // is valid here without a separate constructor.
  private _slotFetchEffect = effect(() => {
    if (!this.showBookDialog()) return;
    this.bookDate();
    this.refreshBookedSlots();
  });

  // ── Same slot grid for Request Callback - fixed 15-min duration since
  //    'callback' requests have no duration field (matches
  //    DEFAULT_CALLBACK_DURATION_MIN in callback-request.router.js). ──
  private static readonly CALLBACK_DURATION_MIN = 15;
  private callbackBookedSlots = signal<BookedSlot[]>([]);

  isCallbackSlotBooked(time: string): boolean {
    const start = this.toMinutes(time);
    return this.callbackBookedSlots().some(s =>
      this.overlapsRange(start, ExpertProfile.CALLBACK_DURATION_MIN, this.toMinutes(s.preferredTime), s.duration)
    );
  }

  selectCallbackSlot(time: string): void {
    if (this.isCallbackSlotBooked(time)) return;
    this.callbackTime.set(time);
  }

  private refreshCallbackBookedSlots(): void {
    const date = this.callbackDate();
    const slug = this.expertId();
    if (!date || !slug) return;
    this.callbackRequests.bookedSlotsFor(slug, date)
      .pipe(catchError(() => of({ status: 200, data: [] as BookedSlot[] })))
      .subscribe(res => this.callbackBookedSlots.set(res.data));
  }

  private _callbackSlotFetchEffect = effect(() => {
    if (!this.showCallbackDialog()) return;
    this.callbackDate();
    this.refreshCallbackBookedSlots();
  });

  private openBookDialog(): void { this.showBookDialog.set(true); this.bookSubmitted.set(false); this.bookError.set(''); }
  onBookClick(): void { this.requireAuth('book', () => this.openBookDialog()); }
  closeBookDialog(): void { this.showBookDialog.set(false); }
  // Shared by both Book Session and Request Callback - requires exactly a
  // 10-digit Indian mobile number, tolerating a leading +91/91 country code
  // (also stripping spaces/dashes/parens first). Mirrored server-side in
  // callback-request.router.js's POST / handler.
  isValidPhone(value: string): boolean {
    let digits = value.replace(/\D/g, '');
    if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
    return digits.length === 10;
  }

  submitBooking(): void {
    if (this.hasUsedFreeSession()) return;
    if (!this.bookDate() || !this.bookTime() || !this.isValidPhone(this.bookPhone()) || this.isBookDateBlocked() || this.bookSubmitting()) return;
    const expert = this.expert()!;
    this.bookSubmitting.set(true);
    this.bookError.set('');
    this.callbackRequests.create({
      expertSlug: expert.slug,
      expertName: expert.name,
      category: expert.category,
      topic: this.bookTopic(),
      preferredDate: this.bookDate(),
      preferredTime: this.bookTime(),
      phone: this.bookPhone().trim(),
      message: this.bookNotes(),
      type: 'booking',
      duration: this.bookDuration(),
    }).subscribe({
      next: () => {
        this.bookSubmitting.set(false);
        this.bookSubmitted.set(true);
      },
      error: (err) => {
        this.bookSubmitting.set(false);
        this.bookError.set(err?.error?.message ?? 'Could not submit your booking. Please try again.');
        if (err?.status === 409) this.refreshBookedSlots();
      },
    });
  }

  // ── Request callback dialog - backed by the real /api/callback-requests API ──
  showCallbackDialog = signal(false);
  callbackDate = signal('');
  callbackTime = signal('');
  callbackTopic = signal<string>(TOPICS[0]);
  callbackPhone = signal('');
  callbackMessage = signal('');
  callbackSubmitted = signal(false);
  callbackSubmitting = signal(false);
  callbackError = signal('');

  // Same whole-day blackout check as isBookDateBlocked() above, applied to
  // the Request Callback dialog's own date field.
  isCallbackDateBlocked = computed<boolean>(() => {
    const date = this.callbackDate();
    return !!date && !!this.realProfile()?.blockedDates?.includes(date);
  });

  private openCallbackDialog(): void { this.showCallbackDialog.set(true); this.callbackSubmitted.set(false); this.callbackError.set(''); }
  onCallbackClick(): void { this.requireAuth('callback', () => this.openCallbackDialog()); }
  closeCallbackDialog(): void { this.showCallbackDialog.set(false); }
  submitCallback(): void {
    if (this.hasUsedFreeSession()) return;
    if (!this.callbackDate() || !this.callbackTime() || !this.isValidPhone(this.callbackPhone()) || this.isCallbackDateBlocked() || this.callbackSubmitting()) return;
    const expert = this.expert()!;
    this.callbackSubmitting.set(true);
    this.callbackError.set('');
    this.callbackRequests.create({
      expertSlug: expert.slug,
      expertName: expert.name,
      category: expert.category,
      topic: this.callbackTopic(),
      preferredDate: this.callbackDate(),
      preferredTime: this.callbackTime(),
      phone: this.callbackPhone().trim(),
      message: this.callbackMessage(),
    }).subscribe({
      next: () => {
        this.callbackSubmitting.set(false);
        this.callbackSubmitted.set(true);
      },
      error: (err) => {
        this.callbackSubmitting.set(false);
        this.callbackError.set(err?.error?.message ?? 'Could not submit your request. Please try again.');
        if (err?.status === 409) this.refreshCallbackBookedSlots();
      },
    });
  }

  avgRatingStars = computed(() => {
    const r = this.realAvgRating() ?? 0;
    return Array.from({ length: 5 }, (_, i) => i < Math.round(r));
  });

  trackByReview(_i: number, r: ExpertReview): string { return r.userName + r.submittedAt; }
  trackBySkill(_i: number, s: string): string { return s; }

  // ══════════════════════════════════════════════════════════════════════════
  // Share (mirrors blog-detail.ts's working share implementation)
  // ══════════════════════════════════════════════════════════════════════════

  shareMenuOpen = signal(false);
  copyLinkSuccess = signal(false);

  private shareUrl(): string {
    return `${environment.siteUrl}/career-guides/${this.expertId()}`;
  }

  async nativeShareProfile(): Promise<void> {
    const e = this.expert();
    if (!e || !isPlatformBrowser(this.platformId)) return;
    if ('share' in navigator) {
      try {
        await (navigator as any).share({
          title: e.name,
          text: `Check out ${e.name}'s mentor profile on ApnaInsights`,
          url: this.shareUrl(),
        });
      } catch (err: any) {
        if (err?.name !== 'AbortError') this.shareMenuOpen.set(true);
      }
    } else {
      this.shareMenuOpen.set(true);
    }
  }

  shareOnTwitter(): void {
    const e = this.expert();
    if (!e || !isPlatformBrowser(this.platformId)) return;
    window.open(
      `https://twitter.com/intent/tweet?url=${encodeURIComponent(this.shareUrl())}&text=${encodeURIComponent(e.name)}`,
      '_blank',
    );
    this.shareMenuOpen.set(false);
  }

  shareOnFacebook(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(this.shareUrl())}`, '_blank');
    this.shareMenuOpen.set(false);
  }

  shareOnLinkedIn(): void {
    const e = this.expert();
    if (!e || !isPlatformBrowser(this.platformId)) return;
    window.open(
      `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(this.shareUrl())}&title=${encodeURIComponent(e.name)}`,
      '_blank',
    );
    this.shareMenuOpen.set(false);
  }

  shareOnWhatsApp(): void {
    const e = this.expert();
    if (!e || !isPlatformBrowser(this.platformId)) return;
    window.open(`https://wa.me/?text=${encodeURIComponent(e.name + ' - ' + this.shareUrl())}`, '_blank');
    this.shareMenuOpen.set(false);
  }

  shareByEmail(): void {
    const e = this.expert();
    if (!isPlatformBrowser(this.platformId)) return;
    const subject = encodeURIComponent(`Check out ${e?.name ?? 'this mentor'}'s profile on ApnaInsights`);
    const body = encodeURIComponent(`I thought you'd find this mentor profile useful: ${this.shareUrl()}`);
    window.open(`mailto:?subject=${subject}&body=${body}`);
    this.shareMenuOpen.set(false);
  }

  async copyLink(): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return;
    try {
      await navigator.clipboard.writeText(this.shareUrl());
      this.copyLinkSuccess.set(true);
      this.toast.show('Profile link copied to clipboard!', 'success');
      setTimeout(() => {
        this.copyLinkSuccess.set(false);
        this.shareMenuOpen.set(false);
      }, 2000);
    } catch {
      this.toast.show('Could not copy link.', 'error');
    }
  }
}
