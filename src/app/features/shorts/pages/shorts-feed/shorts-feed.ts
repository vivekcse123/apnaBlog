import {
  Component, inject, signal, computed, OnInit, OnDestroy, AfterViewInit,
  NgZone, PLATFORM_ID, ViewChildren, QueryList, ElementRef, ViewChild,
} from '@angular/core';
import { isPlatformBrowser, CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { ShortsService } from '../../services/shorts.service';
import { VideoShort, ShortComment } from '../../models/video-short.model';
import { Auth } from '../../../../core/services/auth';
import { ShortsUpload } from '../shorts-upload/shorts-upload';

@Component({
  selector: 'app-shorts-feed',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule, ShortsUpload],
  templateUrl: './shorts-feed.html',
  styleUrl: './shorts-feed.css',
})
export class ShortsFeed implements OnInit, AfterViewInit, OnDestroy {
  private service    = inject(ShortsService);
  private auth       = inject(Auth);
  private sanitizer  = inject(DomSanitizer);
  private ngZone     = inject(NgZone);
  private router     = inject(Router);
  private platformId = inject(PLATFORM_ID);

  @ViewChildren('shortCard') cardRefs!: QueryList<ElementRef<HTMLElement>>;
  @ViewChild('scrollContainer') scrollRef!: ElementRef<HTMLElement>;

  // Cache SafeResourceUrl per YouTube ID — prevents iframe reload on every
  // change-detection cycle (new object reference = browser reloads iframe).
  private safeUrlCache = new Map<string, SafeResourceUrl>();

  shorts       = signal<VideoShort[]>([]);
  isLoading    = signal(false);
  hasMore      = signal(true);
  activeIndex  = signal(0);
  selectedCat  = signal('All');
  showUpload   = signal(false);
  showComments = signal(false);
  commentShort = signal<VideoShort | null>(null);
  commentText  = signal('');
  isSending    = signal(false);
  shareMsg     = signal('');

  // tracks which YouTube cards the user has tapped "play" on
  playedYtIds  = signal<Set<string>>(new Set());
  likedIds     = signal<Set<string>>(this.loadLikedFromStorage());

  private page       = 1;
  private observer!: IntersectionObserver;
  private viewedSet  = new Set<string>();
  private viewTimers = new Map<number, ReturnType<typeof setTimeout>>();

  readonly LIKED_KEY = 'apna_liked_shorts';

  isLoggedIn    = computed(() => !!this.auth.token());
  isAdmin       = computed(() => this.auth.isAdmin());
  currentUserId = computed(() => this.auth.userId());

  categories = [
    'All', 'News', 'Sports', 'Technology', 'Entertainment',
    'Lifestyle', 'Health', 'Business',
  ];

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  ngOnInit(): void {
    this.loadShorts(true);
  }

  ngAfterViewInit(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    this.setupObserver();
    this.cardRefs.changes.subscribe(() => this.observeAll());
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
    this.viewTimers.forEach(t => clearTimeout(t));
  }

  // ── Data ───────────────────────────────────────────────────────────────────

  loadShorts(reset = false): void {
    if (this.isLoading()) return;
    if (reset) { this.page = 1; this.hasMore.set(true); }

    this.isLoading.set(true);
    const cat = this.selectedCat() === 'All' ? undefined : this.selectedCat();

    this.service.getShorts(this.page, 8, cat).subscribe({
      next: res => {
        const items = res.data ?? [];
        this.shorts.update(cur => reset ? items : [...cur, ...items]);
        this.hasMore.set(this.page < (res.totalPages ?? 1));
        this.page++;
        this.isLoading.set(false);
        // Re-observe after new cards render
        setTimeout(() => this.observeAll(), 50);
      },
      error: () => {
        this.isLoading.set(false);
        this.hasMore.set(false);
      },
    });
  }

  onCategorySelect(cat: string): void {
    if (cat === this.selectedCat()) return;
    this.selectedCat.set(cat);
    this.playedYtIds.set(new Set());
    this.safeUrlCache.clear();
    this.viewedSet.clear();
    this.viewTimers.forEach(t => clearTimeout(t));
    this.viewTimers.clear();
    this.loadShorts(true);
    this.scrollRef?.nativeElement.scrollTo({ top: 0, behavior: 'instant' });
  }

  onScroll(): void {
    if (!this.scrollRef) return;
    const el = this.scrollRef.nativeElement;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 200;
    if (nearBottom && this.hasMore() && !this.isLoading()) {
      this.loadShorts();
    }
  }

  // ── IntersectionObserver ───────────────────────────────────────────────────

  private setupObserver(): void {
    this.observer = new IntersectionObserver(
      entries => {
        this.ngZone.run(() => {
          for (const e of entries) {
            if (!e.isIntersecting || e.intersectionRatio < 0.55) continue;
            const idx = Number(e.target.getAttribute('data-idx'));
            if (isNaN(idx)) continue;
            this.activeIndex.set(idx);
            this.scheduleView(idx);
            this.autoPlayVideo(idx);
          }
        });
      },
      { threshold: 0.55 }
    );
  }

  private observeAll(): void {
    if (!this.observer || !this.cardRefs) return;
    this.observer.disconnect();
    this.cardRefs.forEach(ref => this.observer.observe(ref.nativeElement));
  }

  private scheduleView(idx: number): void {
    const short = this.shorts()[idx];
    if (!short || this.viewedSet.has(short._id)) return;
    if (this.viewTimers.has(idx)) return;
    const t = setTimeout(() => {
      this.viewTimers.delete(idx);
      if (!this.viewedSet.has(short._id)) {
        this.viewedSet.add(short._id);
        this.service.addView(short._id).subscribe();
        this.shorts.update(list =>
          list.map((s, i) => i === idx ? { ...s, views: s.views + 1 } : s)
        );
      }
    }, 2000);
    this.viewTimers.set(idx, t);
  }

  // Called by IntersectionObserver — plays video in view, pauses all others.
  // Uses DOM query by data-idx so index always matches regardless of
  // how many YouTube vs upload cards are mixed in the feed.
  autoPlayVideo(cardIdx: number): void {
    this.getAllVideos().forEach(({ vid, idx }) => {
      if (idx === cardIdx) vid.play().catch(() => {});
      else { vid.pause(); vid.currentTime = 0; }
    });
  }

  // Tap-to-toggle for upload videos — pauses if playing, plays if paused.
  toggleVideo(cardIdx: number, event: Event): void {
    event.stopPropagation();
    const vid = this.getVideoAt(cardIdx);
    if (!vid) return;
    if (vid.paused) vid.play().catch(() => {});
    else vid.pause();
  }

  private getVideoAt(cardIdx: number): HTMLVideoElement | null {
    const card = this.scrollRef?.nativeElement
      .querySelector<HTMLElement>(`[data-idx="${cardIdx}"]`);
    return card?.querySelector<HTMLVideoElement>('.short-video') ?? null;
  }

  private getAllVideos(): { vid: HTMLVideoElement; idx: number }[] {
    const result: { vid: HTMLVideoElement; idx: number }[] = [];
    this.scrollRef?.nativeElement
      .querySelectorAll<HTMLElement>('[data-idx]')
      .forEach(card => {
        const vid = card.querySelector<HTMLVideoElement>('.short-video');
        if (vid) result.push({ vid, idx: Number(card.getAttribute('data-idx')) });
      });
    return result;
  }

  // ── YouTube ────────────────────────────────────────────────────────────────

  safeEmbedUrl(youtubeId: string): SafeResourceUrl {
    if (!this.safeUrlCache.has(youtubeId)) {
      this.safeUrlCache.set(
        youtubeId,
        this.sanitizer.bypassSecurityTrustResourceUrl(
          `https://www.youtube.com/embed/${youtubeId}?autoplay=1&playsinline=1&rel=0&modestbranding=1`
        )
      );
    }
    return this.safeUrlCache.get(youtubeId)!;
  }

  youtubeThumbnail(youtubeId: string): string {
    return `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg`;
  }

  isYtPlaying(id: string): boolean {
    return this.playedYtIds().has(id);
  }

  playYouTube(id: string, event: Event): void {
    event.stopPropagation();
    this.playedYtIds.update(s => new Set([...s, id]));
  }

  // ── Like ───────────────────────────────────────────────────────────────────

  isLiked(id: string): boolean { return this.likedIds().has(id); }

  toggleLike(short: VideoShort, event: Event): void {
    event.stopPropagation();
    if (!this.isLoggedIn()) { this.router.navigate(['/auth/login']); return; }

    const liked = this.isLiked(short._id);
    // optimistic update
    this.likedIds.update(s => {
      const next = new Set(s);
      liked ? next.delete(short._id) : next.add(short._id);
      return next;
    });
    this.shorts.update(list =>
      list.map(s => s._id === short._id
        ? { ...s, likesCount: s.likesCount + (liked ? -1 : 1) }
        : s
      )
    );
    this.saveLikedToStorage();

    const req = liked
      ? this.service.unlikeShort(short._id)
      : this.service.likeShort(short._id);
    req.subscribe({ error: () => this.revertLike(short, liked) });
  }

  private revertLike(short: VideoShort, wasLiked: boolean): void {
    this.likedIds.update(s => {
      const next = new Set(s);
      wasLiked ? next.add(short._id) : next.delete(short._id);
      return next;
    });
    this.shorts.update(list =>
      list.map(s => s._id === short._id
        ? { ...s, likesCount: s.likesCount + (wasLiked ? 1 : -1) }
        : s
      )
    );
    this.saveLikedToStorage();
  }

  private loadLikedFromStorage(): Set<string> {
    if (!isPlatformBrowser(this.platformId)) return new Set();
    try {
      const raw = localStorage.getItem(this.LIKED_KEY);
      return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch { return new Set(); }
  }

  private saveLikedToStorage(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    try {
      localStorage.setItem(this.LIKED_KEY, JSON.stringify([...this.likedIds()]));
    } catch { /* quota */ }
  }

  // ── Comments ───────────────────────────────────────────────────────────────

  openComments(short: VideoShort, event: Event): void {
    event.stopPropagation();
    this.commentShort.set(short);
    this.commentText.set('');
    this.showComments.set(true);
    // load full comments
    this.service.getComments(short._id).subscribe({
      next: res => {
        this.shorts.update(list =>
          list.map(s => s._id === short._id ? { ...s, comments: res.data ?? [] } : s)
        );
        this.commentShort.update(cs => cs ? { ...cs, comments: res.data ?? [] } : cs);
      },
      error: () => {},
    });
  }

  closeComments(): void { this.showComments.set(false); this.commentShort.set(null); }

  submitComment(): void {
    const text = this.commentText().trim();
    const short = this.commentShort();
    if (!text || !short || this.isSending()) return;
    if (!this.isLoggedIn()) { this.router.navigate(['/auth/login']); return; }

    this.isSending.set(true);
    this.service.addComment(short._id, text, this.currentUserId() ?? undefined).subscribe({
      next: res => {
        this.isSending.set(false);
        this.commentText.set('');
        const newComment = res.data?.comment;
        if (newComment) {
          const updater = (s: VideoShort) =>
            s._id === short._id
              ? { ...s, comments: [newComment, ...(s.comments ?? [])], commentsCount: s.commentsCount + 1 }
              : s;
          this.shorts.update(list => list.map(updater));
          this.commentShort.update(cs => cs ? updater(cs) : cs);
        }
      },
      error: () => this.isSending.set(false),
    });
  }

  // ── Share ──────────────────────────────────────────────────────────────────

  async share(short: VideoShort, event: Event): Promise<void> {
    event.stopPropagation();
    const url = `${location.origin}/shorts#${short._id}`;
    const data = { title: short.title, text: short.caption ?? short.title, url };

    if (isPlatformBrowser(this.platformId) && navigator.share) {
      try { await navigator.share(data); return; } catch { /* user cancelled */ }
    }
    // fallback: copy to clipboard
    try {
      await navigator.clipboard.writeText(url);
      this.shareMsg.set('Link copied!');
      setTimeout(() => this.shareMsg.set(''), 2000);
    } catch { /* ignore */ }
  }

  // ── Upload modal ───────────────────────────────────────────────────────────

  openUpload(event: Event): void {
    event.stopPropagation();
    if (!this.isAdmin()) return;
    this.showUpload.set(true);
  }

  onShortCreated(short: VideoShort): void {
    this.shorts.update(list => [short, ...list]);
    this.showUpload.set(false);
    this.scrollRef?.nativeElement.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  formatCount(n: number): string {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
    if (n >= 1_000)     return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'k';
    return String(n);
  }

  userInitial(user: VideoShort['user']): string {
    return (user?.name ?? '?').charAt(0).toUpperCase();
  }

  timeAgo(date: Date): string {
    const secs = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
    if (secs < 60)   return 'just now';
    if (secs < 3600) return `${Math.floor(secs / 60)}m`;
    if (secs < 86400) return `${Math.floor(secs / 3600)}h`;
    return `${Math.floor(secs / 86400)}d`;
  }

  trackById(_: number, item: VideoShort): string { return item._id; }
  trackByComment(_: number, c: ShortComment): string { return c._id; }
}
