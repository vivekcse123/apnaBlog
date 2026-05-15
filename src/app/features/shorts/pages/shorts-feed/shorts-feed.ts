import {
  Component, inject, signal, computed, OnInit, OnDestroy, AfterViewInit,
  NgZone, PLATFORM_ID, ViewChildren, QueryList, ElementRef, ViewChild,
} from '@angular/core';
import { isPlatformBrowser, CommonModule, Location } from '@angular/common';
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
  private location   = inject(Location);
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
  showComments    = signal(false);
  commentShort    = signal<VideoShort | null>(null);
  commentText     = signal('');
  isSending       = signal(false);
  shareMsg        = signal('');
  replyingToId    = signal<string | null>(null);
  replyText       = signal('');
  isReplying      = signal(false);
  deletingId      = signal<string | null>(null);

  // tracks which YouTube cards the user has tapped "play" on
  playedYtIds  = signal<Set<string>>(new Set());
  likedIds     = signal<Set<string>>(this.loadLikedFromStorage());
  isMuted             = signal(false);
  pauseIndicatorIdx   = signal(-1);
  indicatorIsPlaying  = signal(false);
  private piTimer: ReturnType<typeof setTimeout> | null = null;

  private page                  = 1;
  private observer!:            IntersectionObserver;
  private viewedSet             = new Set<string>();
  private viewTimers            = new Map<number, ReturnType<typeof setTimeout>>();
  private scrollRafId           = 0;
  private pendingPlayIdx        = -1;
  private adObserver!:          IntersectionObserver;
  private manuallyPausedSet     = new Set<number>();
  private manuallyPausedYtIds   = new Set<string>();
  private touchStartPos         = { x: 0, y: 0 };
  private lastTouchToggleTime   = 0;
  private gestureUnlocked       = true;
  private snapTimer:            ReturnType<typeof setTimeout> | null = null;

  readonly LIKED_KEY   = 'apna_liked_shorts';
  readonly VIEWED_PREFIX = 'apna_viewed_short_';

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
    this.initAdObserver();
    this.cardRefs.changes.subscribe(() => this.observeAll());
    this.setupGestureUnlock();
    this.setupScrollGesturePlay();
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
    this.adObserver?.disconnect();
    this.viewTimers.forEach(t => clearTimeout(t));
    if (this.scrollRafId) cancelAnimationFrame(this.scrollRafId);
    if (this.piTimer) clearTimeout(this.piTimer);
    if (this.snapTimer) clearTimeout(this.snapTimer);
  }

  /** Mobile unmuted autoplay fix.
   *  iOS Safari requires vid.play() to be called SYNCHRONOUSLY inside the
   *  touchend handler — any setTimeout (even 0 ms) exits the user activation
   *  window and the browser blocks unmuted play again.
   *  We predict which card will snap by rounding scrollTop / clientHeight,
   *  then call play() immediately without leaving the event handler. */
  private setupScrollGesturePlay(): void {
    if (!this.scrollRef) return;
    const container = this.scrollRef.nativeElement;

    container.addEventListener('touchend', () => {
      // Calculate snap target synchronously — scroll hasn't animated yet
      const cardH = container.clientHeight || window.innerHeight;
      const nearestIdx = Math.round(container.scrollTop / cardH);

      // Try nearest card and one ahead (handles fast swipes)
      for (const idx of [nearestIdx, nearestIdx + 1, nearestIdx - 1]) {
        if (idx < 0 || idx >= this.shorts().length) continue;
        if (this.manuallyPausedSet.has(idx)) continue;
        const short = this.shorts()[idx];
        if (short?.videoType !== 'upload') continue;

        const card = container.querySelector<HTMLElement>(`[data-idx="${idx}"]`);
        const vid  = card?.querySelector<HTMLVideoElement>('video');
        if (!vid) continue;

        // SYNCHRONOUS — iOS Safari activation window is still open here
        vid.muted = false;
        const p = vid.play();
        if (p) p.catch(() => { vid.muted = true; vid.play().catch(() => {}); });

        // Update Angular state outside of the tight gesture window
        if (this.snapTimer) clearTimeout(this.snapTimer);
        this.snapTimer = setTimeout(() => {
          this.ngZone.run(() => {
            this.isMuted.set(vid.muted);
            this.activeIndex.set(idx);
          });
        }, 350);
        break;
      }
    }, { passive: true });
  }

  private setupGestureUnlock(): void {
    const unlock = () => {
      this.gestureUnlocked = true;
      this.ngZone.run(() => {
        const vid = this.getVideoAt(this.activeIndex());
        if (vid && !vid.paused) {
          vid.muted = false;
          this.isMuted.set(false);
        }

        // Unmute active YouTube iframe
        const activeCard = this.scrollRef?.nativeElement
          .querySelector<HTMLElement>(`[data-idx="${this.activeIndex()}"]`);
        activeCard?.querySelector<HTMLIFrameElement>('.short-iframe')
          ?.contentWindow?.postMessage(
            JSON.stringify({ event: 'command', func: 'unMute', args: '' }), '*'
          );

        if (this.pendingPlayIdx >= 0) {
          this.autoPlayVideo(this.pendingPlayIdx);
          this.pendingPlayIdx = -1;
        }
      });
    };
    document.addEventListener('touchstart', unlock, { once: true, passive: true });
    document.addEventListener('click',      unlock, { once: true, passive: true });
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
        // Wait for Angular to render cards, then observe + play first card
        setTimeout(() => {
          this.observeAll();
          if (reset) this.autoPlayVideo(0);
          this.observeAdCards();
        }, 120);
      },
      error: () => {
        this.isLoading.set(false);
        this.hasMore.set(false);
      },
    });
  }

  onCategorySelect(cat: string): void {
    if (cat === this.selectedCat() && !this.isLoading()) return;
    this.selectedCat.set(cat);
    this.pendingPlayIdx = -1;
    this.playedYtIds.set(new Set());
    this.safeUrlCache.clear();
    this.viewedSet.clear();
    this.viewTimers.forEach(t => clearTimeout(t));
    this.viewTimers.clear();
    this.manuallyPausedSet.clear();
    this.manuallyPausedYtIds.clear();
    this.initAdObserver();
    this.loadShorts(true);
    this.scrollRef?.nativeElement.scrollTo({ top: 0, behavior: 'instant' });
  }

  onScroll(): void {
    if (this.scrollRafId) return;
    this.scrollRafId = requestAnimationFrame(() => {
      this.scrollRafId = 0;
      if (!this.scrollRef) return;
      const el = this.scrollRef.nativeElement;
      const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 200;
      if (nearBottom && this.hasMore() && !this.isLoading()) this.loadShorts();
    });
  }

  /** First ad after the 7th short, then every 8 — keeps early feed clean. */
  isAdSlot(i: number): boolean {
    return i >= 6 && (i - 6) % 8 === 0;
  }

  /** Set up a dedicated IntersectionObserver that initialises each ad slot
   *  exactly once, only when the card is actually visible. */
  private initAdObserver(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    this.adObserver?.disconnect();
    this.adObserver = new IntersectionObserver(entries => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        const ins = e.target.querySelector<HTMLElement>('ins.adsbygoogle');
        // Skip if already initialised (guard against re-render)
        if (!ins || ins.dataset['adLoaded']) continue;
        ins.dataset['adLoaded'] = 'true';
        this.adObserver.unobserve(e.target);
        try {
          const ads: any[] = (window as any).adsbygoogle ?? [];
          (window as any).adsbygoogle = ads;
          ads.push({});
        } catch (_) { /* ignore — slot already initialised */ }
      }
    }, { threshold: 0.5 });
  }

  private observeAdCards(): void {
    if (!this.adObserver || !this.scrollRef) return;
    this.scrollRef.nativeElement
      .querySelectorAll<HTMLElement>('.short-ad-card')
      .forEach(card => this.adObserver.observe(card));
  }

  // ── IntersectionObserver ───────────────────────────────────────────────────

  private setupObserver(): void {
    this.observer = new IntersectionObserver(
      entries => {
        for (const e of entries) {
          const idx = Number(e.target.getAttribute('data-idx'));
          if (isNaN(idx)) continue;

          if (!e.isIntersecting || e.intersectionRatio < 0.8) {
            const short = this.shorts()[idx];
            if (short?.videoType === 'youtube' && short._id) {
              // Keep iframe mounted — just pause via postMessage (no reload, no seek-to-start)
              const card = this.scrollRef?.nativeElement.querySelector<HTMLElement>(`[data-idx="${idx}"]`);
              const iframe = card?.querySelector<HTMLIFrameElement>('.short-iframe');
              iframe?.contentWindow?.postMessage(
                JSON.stringify({ event: 'command', func: 'pauseVideo', args: '' }), '*'
              );
            }
            if (short?.videoType === 'upload') {
              const card = this.scrollRef?.nativeElement.querySelector<HTMLElement>(`[data-idx="${idx}"]`);
              card?.querySelector<HTMLVideoElement>('.short-video')?.pause();
            }
            continue;
          }

          this.ngZone.run(() => {
            this.activeIndex.set(idx);
            this.scheduleView(idx);
            this.autoPlayVideo(idx);
          });
        }
      },
      { threshold: [0, 0.8] }
    );
  }

  private observeAll(): void {
    if (!this.observer || !this.cardRefs) return;
    this.observer.disconnect();
    this.cardRefs.forEach(ref => this.observer.observe(ref.nativeElement));
  }

  private hasViewedInSession(shortId: string): boolean {
    if (this.viewedSet.has(shortId)) return true;
    if (!isPlatformBrowser(this.platformId)) return false;
    try { return !!sessionStorage.getItem(this.VIEWED_PREFIX + shortId); } catch { return false; }
  }

  private markViewedInSession(shortId: string): void {
    this.viewedSet.add(shortId);
    if (!isPlatformBrowser(this.platformId)) return;
    try { sessionStorage.setItem(this.VIEWED_PREFIX + shortId, '1'); } catch { /* quota */ }
  }

  private scheduleView(idx: number): void {
    const short = this.shorts()[idx];
    if (!short || this.hasViewedInSession(short._id)) return;
    if (this.viewTimers.has(idx)) return;
    const t = setTimeout(() => {
      this.viewTimers.delete(idx);
      if (!this.hasViewedInSession(short._id)) {
        this.markViewedInSession(short._id);
        this.service.addView(short._id).subscribe();
        this.shorts.update(list =>
          list.map((s, i) => i === idx ? { ...s, views: s.views + 1 } : s)
        );
      }
    }, 2000);
    this.viewTimers.set(idx, t);
  }

  autoPlayVideo(cardIdx: number): void {
    const short = this.shorts()[cardIdx];
    if (!short) return;

    if (short.videoType === 'youtube' && short._id) {
      if (this.manuallyPausedYtIds.has(short._id)) return;

      const alreadyMounted = this.playedYtIds().has(short._id);
      if (!alreadyMounted) {
        // First entry — render the iframe (URL has autoplay=1&mute=1 for reliable start)
        this.playedYtIds.update(s => new Set([...s, short._id]));
      }

      // Send play + mute state. On first mount this arrives after the player loads;
      // on re-entry it resumes the paused video. Always try to unmute per preference.
      const sendCmds = () => {
        const card   = this.scrollRef?.nativeElement.querySelector<HTMLElement>(`[data-idx="${cardIdx}"]`);
        const iframe = card?.querySelector<HTMLIFrameElement>('.short-iframe');
        if (!iframe?.contentWindow) return;
        if (alreadyMounted) {
          iframe.contentWindow.postMessage(
            JSON.stringify({ event: 'command', func: 'playVideo', args: '' }), '*'
          );
        }
        // Unmute if preference is unmuted AND user has gestured (browser allows it)
        if (!this.isMuted() && this.gestureUnlocked) {
          iframe.contentWindow.postMessage(
            JSON.stringify({ event: 'command', func: 'unMute', args: '' }), '*'
          );
        }
      };
      setTimeout(sendCmds, 800);
      setTimeout(sendCmds, 1600); // second attempt in case player wasn't ready
      return;
    }

    if (this.manuallyPausedSet.has(cardIdx)) return;

    const vid = this.getVideoAt(cardIdx);
    if (!vid) return;

    // After the first user gesture the browser allows unmuted play directly.
    // Before that, start muted (guaranteed to succeed) and attempt to unmute
    // in the resolved callback — works on most Android browsers; iOS Safari
    // will stay muted until gestureUnlock fires and sets vid.muted = false.
    // After gesture: play unmuted directly. Before gesture: start muted,
    // icon shows muted so the user isn't confused by silent "unmuted" state.
    const wantMuted = !this.gestureUnlocked || this.isMuted();
    vid.muted = wantMuted;

    const p = vid.play();
    if (p === undefined) return;

    p.then(() => {
      this.ngZone.run(() => {
        this.isMuted.set(vid.muted); // sync icon with actual state
      });
    }).catch(() => {
      if (!vid.muted) {
        // Unmuted play blocked — fall back to muted silently
        vid.muted = true;
        this.ngZone.run(() => this.isMuted.set(true));
        vid.play().catch(() => { this.pendingPlayIdx = cardIdx; });
      } else {
        this.pendingPlayIdx = cardIdx;
      }
    });
  }

  onCardTouchStart(e: TouchEvent): void {
    this.touchStartPos = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }

  onCardTouchEnd(cardIdx: number, e: TouchEvent): void {
    const t  = e.changedTouches[0];
    const dx = Math.abs(t.clientX - this.touchStartPos.x);
    const dy = Math.abs(t.clientY - this.touchStartPos.y);
    // > 10 px movement = scroll gesture, not a tap
    if (dx > 10 || dy > 10) return;
    const target = e.target as HTMLElement;
    if (target.closest('button, a, input, .short-actions, .short-info')) return;
    this.lastTouchToggleTime = Date.now();
    this.doToggle(cardIdx, e.currentTarget as HTMLElement);
  }

  onCardClick(cardIdx: number, event: Event): void {
    // Suppress synthetic click that fires after a touch we already handled
    if (Date.now() - this.lastTouchToggleTime < 600) return;
    const target = event.target as HTMLElement;
    if (target.closest('button, a, input, .short-actions, .short-info')) return;
    this.doToggle(cardIdx, event.currentTarget as HTMLElement);
  }

  private doToggle(cardIdx: number, cardEl: HTMLElement): void {
    const short = this.shorts()[cardIdx];

    // ── YouTube: postMessage play/pause (iframe stays mounted) ──
    if (short?.videoType === 'youtube' && short._id && this.playedYtIds().has(short._id)) {
      const iframe = cardEl.querySelector<HTMLIFrameElement>('.short-iframe');
      if (this.manuallyPausedYtIds.has(short._id)) {
        this.manuallyPausedYtIds.delete(short._id);
        iframe?.contentWindow?.postMessage(
          JSON.stringify({ event: 'command', func: 'playVideo', args: '' }), '*'
        );
        this.indicatorIsPlaying.set(true);
      } else {
        this.manuallyPausedYtIds.add(short._id);
        iframe?.contentWindow?.postMessage(
          JSON.stringify({ event: 'command', func: 'pauseVideo', args: '' }), '*'
        );
        this.indicatorIsPlaying.set(false);
      }
      this.flashIndicator(cardIdx);
      return;
    }

    // ── Upload video ──
    const vid = cardEl.querySelector<HTMLVideoElement>('video');
    if (!vid) return;
    if (vid.paused) {
      this.manuallyPausedSet.delete(cardIdx);
      vid.muted = true;
      vid.play().then(() => { if (!this.isMuted()) vid.muted = false; }).catch(() => {});
      this.indicatorIsPlaying.set(true);
    } else {
      this.manuallyPausedSet.add(cardIdx);
      vid.pause();
      this.indicatorIsPlaying.set(false);
    }
    this.flashIndicator(cardIdx);
  }

  private flashIndicator(cardIdx: number): void {
    this.pauseIndicatorIdx.set(cardIdx);
    if (this.piTimer) clearTimeout(this.piTimer);
    this.piTimer = setTimeout(() => this.pauseIndicatorIdx.set(-1), 700);
  }

  toggleMute(event: Event): void {
    event.stopPropagation();
    const newMuted = !this.isMuted();
    this.isMuted.set(newMuted);

    const card = (event.currentTarget as HTMLElement).closest('[data-idx]') as HTMLElement | null;

    // Upload video — direct property toggle
    const vid = card?.querySelector<HTMLVideoElement>('.short-video');
    if (vid) { vid.muted = newMuted; return; }

    // YouTube iframe — postMessage (no reload, no restart)
    const iframe = card?.querySelector<HTMLIFrameElement>('.short-iframe');
    if (iframe?.contentWindow) {
      iframe.contentWindow.postMessage(
        JSON.stringify({ event: 'command', func: newMuted ? 'mute' : 'unMute', args: '' }),
        '*'
      );
    }
  }

  private getVideoAt(cardIdx: number): HTMLVideoElement | null {
    const card = this.scrollRef?.nativeElement
      .querySelector<HTMLElement>(`[data-idx="${cardIdx}"]`);
    return card?.querySelector<HTMLVideoElement>('.short-video') ?? null;
  }

  // ── YouTube ────────────────────────────────────────────────────────────────

  safeEmbedUrl(youtubeId: string): SafeResourceUrl {
    if (!this.safeUrlCache.has(youtubeId)) {
      this.safeUrlCache.set(
        youtubeId,
        this.sanitizer.bypassSecurityTrustResourceUrl(
          `https://www.youtube.com/embed/${youtubeId}?autoplay=1&mute=1&playsinline=1&rel=0&modestbranding=1&controls=0&enablejsapi=1`
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

  closeComments(): void {
    this.showComments.set(false);
    this.commentShort.set(null);
    this.replyingToId.set(null);
    this.replyText.set('');
  }

  startReply(commentId: string): void {
    if (this.replyingToId() === commentId) {
      this.replyingToId.set(null);
      this.replyText.set('');
    } else {
      this.replyingToId.set(commentId);
      this.replyText.set('');
    }
  }

  cancelReply(): void {
    this.replyingToId.set(null);
    this.replyText.set('');
  }

  // Returns true if the current user can delete this comment/reply
  canDeleteComment(ownerUserId: string | null | undefined): boolean {
    const uid = this.currentUserId();
    if (!uid) return false;
    // Short owner can always delete; commenter can delete their own
    const short = this.commentShort();
    const isShortOwner = short?.user._id === uid;
    return isShortOwner || ownerUserId === uid;
  }

  deleteComment(commentId: string): void {
    const short = this.commentShort();
    if (!short || this.deletingId()) return;
    this.deletingId.set(commentId);
    this.service.deleteComment(short._id, commentId).subscribe({
      next: () => {
        const updater = (s: VideoShort) =>
          s._id === short._id
            ? { ...s, comments: (s.comments ?? []).filter(c => c._id !== commentId), commentsCount: Math.max(0, s.commentsCount - 1) }
            : s;
        this.shorts.update(l => l.map(updater));
        this.commentShort.update(cs => cs ? updater(cs) : cs);
        this.deletingId.set(null);
      },
      error: () => this.deletingId.set(null),
    });
  }

  deleteReply(commentId: string, replyId: string): void {
    const short = this.commentShort();
    if (!short || this.deletingId()) return;
    this.deletingId.set(replyId);
    this.service.deleteReply(short._id, commentId, replyId).subscribe({
      next: () => {
        const updater = (s: VideoShort) =>
          s._id === short._id
            ? {
                ...s,
                comments: (s.comments ?? []).map(c =>
                  c._id === commentId
                    ? { ...c, replies: (c.replies ?? []).filter(r => r._id !== replyId) }
                    : c
                ),
              }
            : s;
        this.shorts.update(l => l.map(updater));
        this.commentShort.update(cs => cs ? updater(cs) : cs);
        this.deletingId.set(null);
      },
      error: () => this.deletingId.set(null),
    });
  }

  submitReply(commentId: string): void {
    const text = this.replyText().trim();
    const short = this.commentShort();
    if (!text || !short || this.isReplying()) return;
    if (!this.isLoggedIn()) { this.router.navigate(['/auth/login']); return; }

    this.isReplying.set(true);
    this.service.addReply(short._id, commentId, text).subscribe({
      next: res => {
        this.isReplying.set(false);
        this.replyText.set('');
        this.replyingToId.set(null);
        const newReply = res.data?.reply;
        if (newReply) {
          const updater = (s: VideoShort) =>
            s._id === short._id
              ? {
                  ...s,
                  comments: (s.comments ?? []).map(c =>
                    c._id === commentId
                      ? { ...c, replies: [...(c.replies ?? []), newReply] }
                      : c
                  ),
                }
              : s;
          this.shorts.update(list => list.map(updater));
          this.commentShort.update(cs => cs ? updater(cs) : cs);
        }
      },
      error: () => this.isReplying.set(false),
    });
  }

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

  formatDuration(seconds: number | null | undefined): string {
    if (!seconds) return '';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  trackById(_: number, item: VideoShort): string { return item._id; }

  goBack(): void {
    const hasPrev = this.router.lastSuccessfulNavigation?.previousNavigation != null;
    if (hasPrev) this.location.back();
    else this.router.navigate(['/']);
  }
  trackByComment(_: number, c: ShortComment): string { return c._id; }
}
