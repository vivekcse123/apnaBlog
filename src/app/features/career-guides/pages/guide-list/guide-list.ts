import { Component, ChangeDetectionStrategy, OnInit, DestroyRef, signal, computed, inject } from '@angular/core';
import { CommonModule, DOCUMENT, isPlatformBrowser } from '@angular/common';
import { PLATFORM_ID } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, of } from 'rxjs';
import { SiteHeader } from '../../../../shared/site-header/site-header';
import { MobileBottomNav } from '../../../../shared/mobile-bottom-nav/mobile-bottom-nav';
import { MOCK_EXPERTS, MOCK_CATEGORIES } from '../../data/mock-experts';
import { Expert } from '../../models/expert.model';
import { Auth } from '../../../../core/services/auth';
import { UserService } from '../../../user/services/user-service';
import { CallbackRequestService, ExpertRating, ExpertSessionCount } from '../../services/callback-request.service';

type SortKey = 'top-rated' | 'most-experienced' | 'newest';

@Component({
  selector: 'app-guide-list',
  standalone: true,
  imports: [CommonModule, RouterLink, SiteHeader, MobileBottomNav],
  templateUrl: './guide-list.html',
  styleUrl: './guide-list.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GuideList implements OnInit {
  private sanitizer = inject(DomSanitizer);
  private auth = inject(Auth);
  private userService = inject(UserService);
  private callbackRequests = inject(CallbackRequestService);
  private destroyRef = inject(DestroyRef);
  private document = inject(DOCUMENT);
  private platformId = inject(PLATFORM_ID);

  // Real aggregate ratings from actual submitted session feedback (see
  // GET /api/callback-requests/ratings) - keyed by expertSlug. Cards for
  // experts with no real feedback yet show "No reviews yet" instead of a
  // fabricated number.
  private ratings = signal<Map<string, ExpertRating>>(new Map());
  ratingFor(slug: string): ExpertRating | undefined { return this.ratings().get(slug); }

  // Real "Sessions Guided" counts (see GET /api/callback-requests/session-counts) -
  // keyed by expertSlug. 0 for anyone with no completed sessions yet.
  private sessionCounts = signal<Map<string, number>>(new Map());
  sessionsGuidedFor(slug: string): number { return this.sessionCounts().get(slug) ?? 0; }

  // Real follower counts (see GET /api/user/mentor-followers) - keyed by
  // mentorSlug. null (not 0) for experts with no real mentor account yet,
  // so the card can show an honest "-" instead of a fake zero.
  private followerCounts = signal<Map<string, number>>(new Map());
  followersFor(slug: string): number | null { return this.followerCounts().get(slug) ?? null; }

  // Real field on the User model (backend), default false for everyone until
  // an admin approval workflow exists to actually promote someone to mentor.
  isMentor = signal(false);

  isLoggedIn(): boolean { return this.auth.isAuthorized(); }

  // Mentor Requests/Callback Requests live under the user module
  // (/user/:id/...), not under /career-guides.
  myRequestsLink = computed(() => `/user/${this.auth.userId()}/career-guides/callback-requests`);

  // A plain href="#cg-experts" anchor is fragile in this app (SSR/hydration
  // can re-navigate before the browser gets to resolve the in-page fragment,
  // which is what was sending "Explore Experts" back to "/" instead of just
  // scrolling down) - scrolling manually sidesteps that entirely.
  scrollToExperts(event: Event): void {
    event.preventDefault();
    if (!isPlatformBrowser(this.platformId)) return;
    this.document.getElementById('cg-experts')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  ngOnInit(): void {
    // Ratings/session-counts/followers/mentor-check are all live, per-visitor
    // data with no SEO value - skip them on the server so prerendering
    // `career-guides`/`career-guides/explore` doesn't depend on the backend
    // being up (same convention as scrollToExperts above).
    if (!isPlatformBrowser(this.platformId)) return;

    this.callbackRequests.ratings()
      .pipe(takeUntilDestroyed(this.destroyRef), catchError(() => of({ data: [] as ExpertRating[] })))
      .subscribe(res => this.ratings.set(new Map(res.data.map(r => [r.expertSlug, r]))));

    this.callbackRequests.sessionCounts()
      .pipe(takeUntilDestroyed(this.destroyRef), catchError(() => of({ data: [] as ExpertSessionCount[] })))
      .subscribe(res => this.sessionCounts.set(new Map(res.data.map(r => [r.expertSlug, r.count]))));

    this.userService.getMentorFollowerCounts()
      .pipe(takeUntilDestroyed(this.destroyRef), catchError(() => of({ data: [] as { expertSlug: string; followersCount: number }[] })))
      .subscribe(res => this.followerCounts.set(new Map(res.data.map(r => [r.expertSlug, r.followersCount]))));

    const userId = this.auth.userId();
    if (!userId) return;
    this.userService.getUserById(userId)
      .pipe(takeUntilDestroyed(this.destroyRef), catchError(() => of({ data: null })))
      .subscribe(res => this.isMentor.set(!!res.data?.isMentor));
  }

  // This whole page runs on MOCK_EXPERTS (see data/mock-experts.ts) - there is
  // no /career-guides backend yet. Swap this signal's source for a real
  // service call once one exists; nothing else here should need to change.
  private allExperts = signal<Expert[]>(MOCK_EXPERTS);
  categories = MOCK_CATEGORIES;

  selectedCategory = signal<string>('All');
  sortBy = signal<SortKey>('top-rated');
  showSortDropdown = signal(false);

  selectCategory(name: string): void { this.selectedCategory.set(name); }
  setSort(key: SortKey): void { this.sortBy.set(key); this.showSortDropdown.set(false); }

  categoryCount(name: string): number {
    return this.allExperts().filter(e => e.category === name).length;
  }

  filteredExperts = computed<Expert[]>(() => {
    const cat = this.selectedCategory();
    const list = cat === 'All' ? this.allExperts() : this.allExperts().filter(e => e.category === cat);
    const sorted = [...list];
    switch (this.sortBy()) {
      case 'most-experienced':
        sorted.sort((a, b) => b.yearsExperience - a.yearsExperience);
        break;
      case 'newest':
        sorted.reverse();
        break;
      default:
        sorted.sort((a, b) => b.rating - a.rating);
    }
    return sorted;
  });

  sortLabel = computed(() => {
    switch (this.sortBy()) {
      case 'most-experienced': return 'Most Experienced';
      case 'newest': return 'Newest';
      default: return 'Top Rated';
    }
  });

  private static readonly CATEGORY_ICONS: Record<string, string> = {
    angular: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l9 3.2-1.4 12L12 22l-7.6-4.8L3 5.2z"/><path d="M12 6.5L7.5 17M12 6.5L16.5 17M9 13.5h6"/></svg>`,
    react:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="2.2"/><ellipse cx="12" cy="12" rx="10" ry="4.2"/><ellipse cx="12" cy="12" rx="10" ry="4.2" transform="rotate(60 12 12)"/><ellipse cx="12" cy="12" rx="10" ry="4.2" transform="rotate(120 12 12)"/></svg>`,
    ba:      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 13l2.5 2.5L16 9"/></svg>`,
    data:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>`,
    shield:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6z"/><path d="M9 12l2 2 4-4"/></svg>`,
  };
  private static readonly ALL_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="3.5" width="7" height="7" rx="1.6"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.6"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.6"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.6"/></svg>`;

  private iconCache = new Map<string, SafeHtml>();
  // Always called with 'All' - the fixed "All Experts" chip/list-item icon.
  allCategoryIcon: SafeHtml = this.sanitizer.bypassSecurityTrustHtml(GuideList.ALL_ICON);

  categoryIconByMeta(iconKey: string): SafeHtml {
    let icon = this.iconCache.get('meta:' + iconKey);
    if (!icon) {
      icon = this.sanitizer.bypassSecurityTrustHtml(GuideList.CATEGORY_ICONS[iconKey] ?? GuideList.ALL_ICON);
      this.iconCache.set('meta:' + iconKey, icon);
    }
    return icon;
  }

  trackByExpertId(_i: number, e: Expert): string { return e.id; }
  trackByCategory(_i: number, c: { name: string }): string { return c.name; }
}
