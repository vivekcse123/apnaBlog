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

  @ViewChildren('reelCard') cardRefs!: QueryList<ElementRef<HTMLElement>>;
  @ViewChild('reelFeed')    feedRef!:  ElementRef<HTMLElement>;

  private safeUrlCache = new Map<string, SafeResourceUrl>();

  // ── Signals ────────────────────────────────────────────────────────────────
  shorts             = signal<VideoShort[]>([]);
  isLoading          = signal(false);
  hasMore            = signal(true);
  activeIndex        = signal(0);
  selectedCat        = signal('All');
  showUpload         = signal(false);
  showComments       = signal(false);
  commentShort       = signal<VideoShort | null>(null);
  commentText        = signal('');
  isSending          = signal(false);
  shareMsg           = signal('');
  replyingToId       = signal<string | null>(null);
  replyText          = signal('');
  isReplying         = signal(false);
  deletingId         = signal<string | null>(null);
  playedYtIds        = signal<Set<string>>(new Set()); // YT iframes mounted in DOM
  likedIds           = signal<Set<string>>(this.loadLikedFromStorage());
  isMuted            = signal(true);   // start muted; mute-button in header unmutes
  needsGesture       = signal(false);
  pauseIndicatorIdx  = signal(-1);
  indicatorIsPlaying = signal(false);
  likeFlashIdx       = signal(-1);
  holdingIdx         = signal(-1);
  expandedCaptions   = signal<Set<string>>(new Set());

  // ── Private state ──────────────────────────────────────────────────────────
  private page                = 1;
  private observer!:          IntersectionObserver;
  private adObserver!:        IntersectionObserver;
  private viewedSet           = new Set<string>();
  private viewTimers          = new Map<number, ReturnType<typeof setTimeout>>();
  private scrollRafId         = 0;
  private scrollSettleTimer:  ReturnType<typeof setTimeout> | null = null;
  private pendingPlayIdx      = -1;
  private manuallyPausedSet   = new Set<number>();
  private manuallyPausedYtIds = new Set<string>();
  private gestureUnlocked     = false;
  private progressBound       = new Set<number>();
  private touchStartPos       = { x: 0, y: 0 };
  private lastTouchToggleTime = 0;
  private lastTapIdx          = -1;
  private lastTapTime         = 0;
  private piTimer:        ReturnType<typeof setTimeout> | null = null;
  private holdTimer:      ReturnType<typeof setTimeout> | null = null;
  private likeFlashTimer: ReturnType<typeof setTimeout> | null = null;

  // ── YouTube postMessage handler ────────────────────────────────────────────
  // onReady → send playVideo + mute for the active card.
  // iOS Safari may give null/opaque e.source for cross-origin iframes, so we
  // try identity matching first, then fall back to activeIndex().
  private readonly ytMsgHandler = (e: MessageEvent) => {
    if (!e.data || typeof e.data !== 'string') return;
    try {
      const msg = JSON.parse(e.data);
      if (msg.event !== 'onReady') return;
      if (!this.feedRef?.nativeElement) return;

      // Identify which card sent onReady.
      let matchedIdx = -1;
      if (e.source) {
        for (const iframe of Array.from(
          this.feedRef.nativeElement.querySelectorAll<HTMLIFrameElement>('.reel-iframe')
        )) {
          if (iframe.contentWindow === (e.source as Window)) {
            matchedIdx = Number(
              iframe.closest<HTMLElement>('[data-idx]')?.getAttribute('data-idx') ?? '-1'
            );
            break;
          }
        }
      }
      // Fallback when e.source matching fails (iOS cross-origin restriction).
      if (matchedIdx < 0) matchedIdx = this.activeIndex();

      // Only play the card that is currently active.
      if (matchedIdx !== this.activeIndex()) return;

      this.ngZone.run(() => {
        const short = this.shorts()[matchedIdx];
        if (!short || this.manuallyPausedYtIds.has(short._id)) return;
        const card   = this.feedRef?.nativeElement.querySelector<HTMLElement>(`[data-idx="${matchedIdx}"]`);
        const iframe = card?.querySelector<HTMLIFrameElement>('.reel-iframe');
        if (!iframe?.contentWindow) return;
        iframe.contentWindow.postMessage(
          JSON.stringify({ event: 'command', func: 'playVideo', args: '' }), '*'
        );
        // Respect current mute preference — user may have unmuted before onReady fired.
        iframe.contentWindow.postMessage(
          JSON.stringify({ event: 'command', func: this.isMuted() ? 'mute' : 'unMute', args: '' }), '*'
        );
      });
    } catch { /* non-JSON / cross-origin */ }
  };

  readonly LIKED_KEY     = 'apna_liked_shorts';
  readonly VIEWED_PREFIX = 'apna_viewed_short_';

  isLoggedIn    = computed(() => !!this.auth.token());
  isAdmin       = computed(() => this.auth.isAdmin());
  currentUserId = computed(() => this.auth.userId());

  categories = [
    'All', 'News', 'Sports', 'Technology', 'Entertainment',
    'Lifestyle', 'Health', 'Business', 'Education',
  ];

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  ngOnInit(): void { this.loadShorts(true); }

  ngAfterViewInit(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    this.setupObserver();
    this.initAdObserver();
    this.cardRefs.changes.subscribe(() => this.observeAll());
    this.setupGestureUnlock();
    this.setupScrollGesturePlay();
    this.setupScrollEndPlay();
    this.ngZone.runOutsideAngular(() =>
      window.addEventListener('message', this.ytMsgHandler, { passive: true })
    );
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
    this.adObserver?.disconnect();
    this.viewTimers.forEach(t => clearTimeout(t));
    if (this.scrollRafId)       cancelAnimationFrame(this.scrollRafId);
    if (this.scrollSettleTimer) clearTimeout(this.scrollSettleTimer);
    if (this.piTimer)           clearTimeout(this.piTimer);
    if (this.holdTimer)         clearTimeout(this.holdTimer);
    if (this.likeFlashTimer)    clearTimeout(this.likeFlashTimer);
    window.removeEventListener('message', this.ytMsgHandler);
  }

  // ── Gesture unlock ─────────────────────────────────────────────────────────

  unlockAudio(event?: Event): void {
    event?.stopPropagation();
    this.gestureUnlocked = true;
    const idx = this.activeIndex();
    const vid = this.getVideoAt(idx);
    if (vid && !this.isMuted()) {
      vid.muted = false;
      if (vid.paused) vid.play().catch(() => {});
    }
    if (!this.isMuted()) {
      this.feedRef?.nativeElement
        .querySelector<HTMLElement>(`[data-idx="${idx}"]`)
        ?.querySelector<HTMLIFrameElement>('.reel-iframe')
        ?.contentWindow?.postMessage(
          JSON.stringify({ event: 'command', func: 'unMute', args: '' }), '*'
        );
    }
    this.ngZone.run(() => {
      this.needsGesture.set(false);
      if (this.pendingPlayIdx >= 0) {
        this.autoPlayVideo(this.pendingPlayIdx);
        this.pendingPlayIdx = -1;
      }
    });
  }

  private setupGestureUnlock(): void {
    const unlock = () => {
      if (this.gestureUnlocked) return;
      this.gestureUnlocked = true;
    };
    document.addEventListener('touchend', unlock, { once: true, passive: true });
    document.addEventListener('click',    unlock, { once: true, passive: true });
  }

  private setupScrollGesturePlay(): void {
    if (!this.feedRef) return;
    const container = this.feedRef.nativeElement;
    let startY = 0;

    container.addEventListener('touchstart', (e: TouchEvent) => {
      startY = e.touches[0].clientY;
    }, { passive: true });

    container.addEventListener('touchend', (e: TouchEvent) => {
      const dy = Math.abs((e.changedTouches[0]?.clientY ?? startY) - startY);
      if (dy < 30) return;
      // Pause everything immediately; setupScrollEndPlay() will play the right card.
      container.querySelectorAll<HTMLVideoElement>('.reel-video').forEach(v => {
        v.muted = true; v.pause();
      });
      container.querySelectorAll<HTMLIFrameElement>('.reel-iframe').forEach(fr => {
        fr.contentWindow?.postMessage(
          JSON.stringify({ event: 'command', func: 'pauseVideo', args: '' }), '*'
        );
      });
    }, { passive: true });
  }

  private setupScrollEndPlay(): void {
    if (!this.feedRef) return;
    const container = this.feedRef.nativeElement;

    const onSettle = () => {
      const idx = Math.round(container.scrollTop / container.clientHeight);
      this.ngZone.run(() => {
        this.activeIndex.set(idx);
        this.autoPlayVideo(idx);
      });
    };

    if ('onscrollend' in window) {
      container.addEventListener('scrollend', onSettle, { passive: true });
    } else {
      container.addEventListener('scroll', () => {
        if (this.scrollSettleTimer) clearTimeout(this.scrollSettleTimer);
        this.scrollSettleTimer = setTimeout(onSettle, 200);
      }, { passive: true });
    }
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
        requestAnimationFrame(() => requestAnimationFrame(() => {
          this.observeAll();
          if (reset) this.autoPlayVideo(0);
          this.observeAdCards();
        }));
      },
      error: () => { this.isLoading.set(false); this.hasMore.set(false); },
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
    this.progressBound.clear();
    this.loadShorts(true);
    this.feedRef?.nativeElement.scrollTo({ top: 0, behavior: 'instant' });
  }

  onScroll(): void {
    if (this.scrollRafId) return;
    this.scrollRafId = requestAnimationFrame(() => {
      this.scrollRafId = 0;
      if (!this.feedRef) return;
      const el = this.feedRef.nativeElement;
      if (el.scrollHeight - el.scrollTop - el.clientHeight < 200
          && this.hasMore() && !this.isLoading()) this.loadShorts();
    });
  }

  isAdSlot(i: number): boolean { return i >= 6 && (i - 6) % 8 === 0; }

  private initAdObserver(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    this.adObserver?.disconnect();
    this.adObserver = new IntersectionObserver(entries => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        const ins = e.target.querySelector<HTMLElement>('ins.adsbygoogle');
        if (!ins || ins.dataset['adLoaded']) continue;
        ins.dataset['adLoaded'] = 'true';
        this.adObserver.unobserve(e.target);
        try {
          const ads: any[] = (window as any).adsbygoogle ?? [];
          (window as any).adsbygoogle = ads;
          ads.push({});
        } catch { /* already init */ }
      }
    }, { threshold: 0.5 });
  }

  private observeAdCards(): void {
    if (!this.adObserver || !this.feedRef) return;
    this.feedRef.nativeElement
      .querySelectorAll<HTMLElement>('.reel-ad-card')
      .forEach(card => this.adObserver.observe(card));
  }

  // ── IntersectionObserver ───────────────────────────────────────────────────

  private setupObserver(): void {
    this.observer = new IntersectionObserver(entries => {
      for (const e of entries) {
        const idx = Number(e.target.getAttribute('data-idx'));
        if (isNaN(idx)) continue;
        if (!e.isIntersecting || e.intersectionRatio < 0.8) {
          const short = this.shorts()[idx];
          const card  = this.feedRef?.nativeElement.querySelector<HTMLElement>(`[data-idx="${idx}"]`);
          if (short?.videoType === 'youtube') {
            card?.querySelector<HTMLIFrameElement>('.reel-iframe')
              ?.contentWindow?.postMessage(
                JSON.stringify({ event: 'command', func: 'pauseVideo', args: '' }), '*'
              );
          }
          if (short?.videoType === 'upload') {
            const v = card?.querySelector<HTMLVideoElement>('.reel-video');
            if (v) { v.muted = true; v.pause(); }
            this.manuallyPausedSet.delete(idx);
          }
          continue;
        }
        this.ngZone.run(() => {
          this.activeIndex.set(idx);
          this.scheduleView(idx);
          this.autoPlayVideo(idx);
          this.preloadAdjacent(idx);
        });
      }
    }, { threshold: [0, 0.8] });
  }

  private observeAll(): void {
    if (!this.observer || !this.cardRefs) return;
    this.observer.disconnect();
    this.cardRefs.forEach(ref => this.observer.observe(ref.nativeElement));
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

  private hasViewedInSession(id: string): boolean {
    if (this.viewedSet.has(id)) return true;
    if (!isPlatformBrowser(this.platformId)) return false;
    try { return !!sessionStorage.getItem(this.VIEWED_PREFIX + id); } catch { return false; }
  }

  private markViewedInSession(id: string): void {
    this.viewedSet.add(id);
    if (!isPlatformBrowser(this.platformId)) return;
    try { sessionStorage.setItem(this.VIEWED_PREFIX + id, '1'); } catch { /* quota */ }
  }

  private preloadAdjacent(currentIdx: number): void {
    for (const offset of [1, 2]) {
      const short = this.shorts()[currentIdx + offset];
      if (short?.videoType === 'upload') {
        const vid = this.getVideoAt(currentIdx + offset);
        if (vid && vid.preload !== 'auto') { vid.preload = 'auto'; vid.load(); }
      }
    }
  }

  // ── Video playback ─────────────────────────────────────────────────────────

  private pauseAllExcept(activeIdx: number): void {
    if (!this.feedRef?.nativeElement) return;
    const c = this.feedRef.nativeElement;
    c.querySelectorAll<HTMLVideoElement>('.reel-video').forEach(vid => {
      const idx = Number(vid.closest<HTMLElement>('[data-idx]')?.getAttribute('data-idx'));
      if (idx !== activeIdx) { vid.muted = true; vid.pause(); }
    });
    c.querySelectorAll<HTMLIFrameElement>('.reel-iframe').forEach(iframe => {
      const idx = Number(iframe.closest<HTMLElement>('[data-idx]')?.getAttribute('data-idx'));
      if (idx !== activeIdx)
        iframe.contentWindow?.postMessage(
          JSON.stringify({ event: 'command', func: 'pauseVideo', args: '' }), '*'
        );
    });
  }

  private attachProgress(cardIdx: number, vid: HTMLVideoElement): void {
    if (this.progressBound.has(cardIdx)) return;
    this.progressBound.add(cardIdx);
    const card = this.feedRef?.nativeElement.querySelector<HTMLElement>(`[data-idx="${cardIdx}"]`);
    if (!card) return;
    vid.addEventListener('timeupdate', () => {
      if (vid.duration > 0)
        card.style.setProperty('--vp', `${(vid.currentTime / vid.duration) * 100}%`);
    }, { passive: true });
    vid.addEventListener('ended', () => card.style.setProperty('--vp', '100%'), { passive: true });
  }

  autoPlayVideo(cardIdx: number): void {
    const short = this.shorts()[cardIdx];
    if (!short) return;
    this.pauseAllExcept(cardIdx);

    // ── YouTube ──────────────────────────────────────────────────────────────
    if (short.videoType === 'youtube' && short._id) {
      if (this.manuallyPausedYtIds.has(short._id)) return;

      // Mount iframe if not yet in DOM.
      const alreadyMounted = this.playedYtIds().has(short._id);
      if (!alreadyMounted) {
        this.playedYtIds.update(s => new Set([...s, short._id]));
      }

      // Helper: send playVideo + mute/unMute to the active card's iframe.
      // Reads isMuted() at call time so it always respects the user's current
      // preference — retries must never re-mute after the user has unmuted.
      const sendPlay = () => {
        if (this.activeIndex() !== cardIdx) return;
        const card   = this.feedRef?.nativeElement.querySelector<HTMLElement>(`[data-idx="${cardIdx}"]`);
        const iframe = card?.querySelector<HTMLIFrameElement>('.reel-iframe');
        if (!iframe?.contentWindow) return;
        iframe.contentWindow.postMessage(
          JSON.stringify({ event: 'command', func: 'playVideo', args: '' }), '*'
        );
        iframe.contentWindow.postMessage(
          JSON.stringify({ event: 'command', func: this.isMuted() ? 'mute' : 'unMute', args: '' }), '*'
        );
      };

      if (!alreadyMounted) {
        // Wait for Angular to render the iframe, then listen for its load event.
        requestAnimationFrame(() => requestAnimationFrame(() => {
          const card   = this.feedRef?.nativeElement.querySelector<HTMLElement>(`[data-idx="${cardIdx}"]`);
          const iframe = card?.querySelector<HTMLIFrameElement>('.reel-iframe');
          iframe?.addEventListener('load', () => this.ngZone.run(sendPlay), { once: true });
        }));
      }

      // Belt-and-suspenders retries for slow iOS / cellular networks.
      setTimeout(sendPlay, 300);
      setTimeout(sendPlay, 900);
      setTimeout(sendPlay, 2000);
      setTimeout(sendPlay, 4000);
      return;
    }

    // ── Upload video ─────────────────────────────────────────────────────────
    if (this.manuallyPausedSet.has(cardIdx)) return;
    const vid = this.getVideoAt(cardIdx);
    if (!vid) return;
    this.attachProgress(cardIdx, vid);

    if (!vid.paused) {
      // Already playing — sync mute state if user has unmuted.
      if (this.gestureUnlocked && !this.isMuted()) vid.muted = false;
      return;
    }

    vid.muted = true; // always start muted; browser allows muted autoplay everywhere
    vid.play()
      .then(() => {
        if (this.gestureUnlocked && !this.isMuted()) vid.muted = false;
      })
      .catch(() => { this.pendingPlayIdx = cardIdx; });
  }

  // ── Touch handlers ─────────────────────────────────────────────────────────

  onCardTouchStart(cardIdx: number, e: TouchEvent): void {
    this.touchStartPos = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    const target = e.target as HTMLElement;
    if (target.closest('button, a, input, .reel-actions, .reel-info')) return;
    if (this.holdTimer) clearTimeout(this.holdTimer);
    this.holdTimer = setTimeout(() => {
      const short = this.shorts()[cardIdx];
      if (short?.videoType === 'upload') {
        const vid = (e.currentTarget as HTMLElement).querySelector<HTMLVideoElement>('video');
        if (vid && !vid.paused) vid.pause();
      }
      this.ngZone.run(() => this.holdingIdx.set(cardIdx));
    }, 400);
  }

  onCardTouchEnd(cardIdx: number, e: TouchEvent): void {
    if (this.holdTimer) { clearTimeout(this.holdTimer); this.holdTimer = null; }
    if (this.holdingIdx() === cardIdx) {
      this.holdingIdx.set(-1);
      const short = this.shorts()[cardIdx];
      if (short?.videoType === 'upload' && !this.manuallyPausedSet.has(cardIdx)) {
        const vid = (e.currentTarget as HTMLElement).querySelector<HTMLVideoElement>('video');
        if (vid) vid.play().catch(() => {});
      }
      return;
    }
    const t  = e.changedTouches[0];
    const dx = Math.abs(t.clientX - this.touchStartPos.x);
    const dy = Math.abs(t.clientY - this.touchStartPos.y);
    if (dx > 10 || dy > 10) return;
    const target = e.target as HTMLElement;
    if (target.closest('button, a, input, .reel-actions, .reel-info')) return;
    const now      = Date.now();
    const isDblTap = this.lastTapIdx === cardIdx && now - this.lastTapTime < 300;
    this.lastTapIdx  = cardIdx;
    this.lastTapTime = now;
    if (isDblTap) {
      const short = this.shorts()[cardIdx];
      if (short && this.isLoggedIn()) this.doLike(short);
      this.likeFlashIdx.set(cardIdx);
      if (this.likeFlashTimer) clearTimeout(this.likeFlashTimer);
      this.likeFlashTimer = setTimeout(() => this.ngZone.run(() => this.likeFlashIdx.set(-1)), 900);
      return;
    }
    this.lastTouchToggleTime = Date.now();
    this.doToggle(cardIdx, e.currentTarget as HTMLElement);
  }

  onCardClick(cardIdx: number, event: Event): void {
    if (Date.now() - this.lastTouchToggleTime < 600) return;
    const target = event.target as HTMLElement;
    if (target.closest('button, a, input, .reel-actions, .reel-info')) return;
    this.doToggle(cardIdx, event.currentTarget as HTMLElement);
  }

  private doToggle(cardIdx: number, cardEl: HTMLElement): void {
    const short = this.shorts()[cardIdx];

    // YouTube card
    if (short?.videoType === 'youtube' && short._id && this.playedYtIds().has(short._id)) {
      const iframe = cardEl.querySelector<HTMLIFrameElement>('.reel-iframe');
      if (this.manuallyPausedYtIds.has(short._id)) {
        this.manuallyPausedYtIds.delete(short._id);
        iframe?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func: 'playVideo', args: '' }), '*');
        this.indicatorIsPlaying.set(true);
      } else {
        this.manuallyPausedYtIds.add(short._id);
        iframe?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func: 'pauseVideo', args: '' }), '*');
        this.indicatorIsPlaying.set(false);
      }
      this.flashIndicator(cardIdx);
      return;
    }

    // Upload video
    const vid = cardEl.querySelector<HTMLVideoElement>('video');
    if (!vid) return;
    if (!vid.paused) {
      this.manuallyPausedSet.add(cardIdx);
      vid.pause();
      this.indicatorIsPlaying.set(false);
      this.flashIndicator(cardIdx);
      return;
    }
    this.manuallyPausedSet.delete(cardIdx);
    vid.muted = this.isMuted();
    vid.play().catch(() => {});
    this.indicatorIsPlaying.set(true);
    this.flashIndicator(cardIdx);
  }

  private flashIndicator(cardIdx: number): void {
    this.pauseIndicatorIdx.set(cardIdx);
    if (this.piTimer) clearTimeout(this.piTimer);
    this.piTimer = setTimeout(() => this.ngZone.run(() => this.pauseIndicatorIdx.set(-1)), 700);
  }

  toggleMute(event: Event): void {
    event.stopPropagation();
    const newMuted = !this.isMuted();
    this.isMuted.set(newMuted);
    if (!newMuted) { this.gestureUnlocked = true; this.needsGesture.set(false); }
    if (!this.feedRef?.nativeElement) return;
    const c = this.feedRef.nativeElement;
    c.querySelectorAll<HTMLVideoElement>('.reel-video').forEach(vid => { vid.muted = newMuted; });
    c.querySelectorAll<HTMLIFrameElement>('.reel-iframe').forEach(iframe => {
      iframe.contentWindow?.postMessage(
        JSON.stringify({ event: 'command', func: newMuted ? 'mute' : 'unMute', args: '' }), '*'
      );
    });
  }

  private getVideoAt(cardIdx: number): HTMLVideoElement | null {
    return this.feedRef?.nativeElement
      .querySelector<HTMLElement>(`[data-idx="${cardIdx}"]`)
      ?.querySelector<HTMLVideoElement>('.reel-video') ?? null;
  }

  // ── Like ───────────────────────────────────────────────────────────────────

  private doLike(short: VideoShort): void {
    if (this.isLiked(short._id)) return;
    this.likedIds.update(s => { const n = new Set(s); n.add(short._id); return n; });
    this.shorts.update(list =>
      list.map(s => s._id === short._id ? { ...s, likesCount: s.likesCount + 1 } : s)
    );
    this.saveLikedToStorage();
    this.service.likeShort(short._id).subscribe({ error: () => this.revertLike(short, false) });
  }

  isLiked(id: string): boolean { return this.likedIds().has(id); }

  toggleLike(short: VideoShort, event: Event): void {
    event.stopPropagation();
    if (!this.isLoggedIn()) { this.router.navigate(['/auth/login']); return; }
    const liked = this.isLiked(short._id);
    this.likedIds.update(s => {
      const n = new Set(s);
      liked ? n.delete(short._id) : n.add(short._id);
      return n;
    });
    this.shorts.update(list =>
      list.map(s => s._id === short._id ? { ...s, likesCount: s.likesCount + (liked ? -1 : 1) } : s)
    );
    this.saveLikedToStorage();
    (liked ? this.service.unlikeShort(short._id) : this.service.likeShort(short._id))
      .subscribe({ error: () => this.revertLike(short, liked) });
  }

  private revertLike(short: VideoShort, wasLiked: boolean): void {
    this.likedIds.update(s => {
      const n = new Set(s);
      wasLiked ? n.add(short._id) : n.delete(short._id);
      return n;
    });
    this.shorts.update(list =>
      list.map(s => s._id === short._id ? { ...s, likesCount: s.likesCount + (wasLiked ? 1 : -1) } : s)
    );
    this.saveLikedToStorage();
  }

  private loadLikedFromStorage(): Set<string> {
    if (!isPlatformBrowser(this.platformId)) return new Set();
    try { const r = localStorage.getItem(this.LIKED_KEY); return r ? new Set(JSON.parse(r)) : new Set(); }
    catch { return new Set(); }
  }

  private saveLikedToStorage(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    try { localStorage.setItem(this.LIKED_KEY, JSON.stringify([...this.likedIds()])); } catch { /* quota */ }
  }

  // ── YouTube helpers ────────────────────────────────────────────────────────

  safeEmbedUrl(youtubeId: string): SafeResourceUrl {
    if (!this.safeUrlCache.has(youtubeId)) {
      this.safeUrlCache.set(youtubeId, this.sanitizer.bypassSecurityTrustResourceUrl(
        `https://www.youtube.com/embed/${youtubeId}` +
        `?autoplay=1&mute=1&playsinline=1&rel=0&modestbranding=1` +
        `&controls=0&iv_load_policy=3&enablejsapi=1` +
        `&origin=${encodeURIComponent(location.origin)}`
      ));
    }
    return this.safeUrlCache.get(youtubeId)!;
  }

  isYtMounted(id: string): boolean { return this.playedYtIds().has(id); }

  // ── Comments ───────────────────────────────────────────────────────────────

  openComments(short: VideoShort, event: Event): void {
    event.stopPropagation();
    this.commentShort.set(short);
    this.commentText.set('');
    this.showComments.set(true);
    this.service.getComments(short._id).subscribe({
      next: res => {
        this.shorts.update(list => list.map(s => s._id === short._id ? { ...s, comments: res.data ?? [] } : s));
        this.commentShort.update(cs => cs ? { ...cs, comments: res.data ?? [] } : cs);
      },
    });
  }

  closeComments(): void {
    this.showComments.set(false);
    this.commentShort.set(null);
    this.replyingToId.set(null);
    this.replyText.set('');
  }

  startReply(commentId: string): void {
    this.replyingToId() === commentId
      ? (this.replyingToId.set(null), this.replyText.set(''))
      : (this.replyingToId.set(commentId), this.replyText.set(''));
  }

  canDeleteComment(ownerUserId: string | null | undefined): boolean {
    const uid = this.currentUserId();
    if (!uid) return false;
    return this.commentShort()?.user._id === uid || ownerUserId === uid;
  }

  deleteComment(commentId: string): void {
    const short = this.commentShort();
    if (!short || this.deletingId()) return;
    this.deletingId.set(commentId);
    this.service.deleteComment(short._id, commentId).subscribe({
      next: () => {
        const upd = (s: VideoShort) => s._id === short._id
          ? { ...s, comments: (s.comments ?? []).filter(c => c._id !== commentId), commentsCount: Math.max(0, s.commentsCount - 1) }
          : s;
        this.shorts.update(l => l.map(upd));
        this.commentShort.update(cs => cs ? upd(cs) : cs);
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
        const upd = (s: VideoShort) => s._id === short._id
          ? { ...s, comments: (s.comments ?? []).map(c => c._id === commentId
              ? { ...c, replies: (c.replies ?? []).filter(r => r._id !== replyId) }
              : c) }
          : s;
        this.shorts.update(l => l.map(upd));
        this.commentShort.update(cs => cs ? upd(cs) : cs);
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
          const upd = (s: VideoShort) => s._id === short._id
            ? { ...s, comments: (s.comments ?? []).map(c => c._id === commentId
                ? { ...c, replies: [...(c.replies ?? []), newReply] }
                : c) }
            : s;
          this.shorts.update(l => l.map(upd));
          this.commentShort.update(cs => cs ? upd(cs) : cs);
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
          const upd = (s: VideoShort) => s._id === short._id
            ? { ...s, comments: [newComment, ...(s.comments ?? [])], commentsCount: s.commentsCount + 1 }
            : s;
          this.shorts.update(l => l.map(upd));
          this.commentShort.update(cs => cs ? upd(cs) : cs);
        }
      },
      error: () => this.isSending.set(false),
    });
  }

  // ── Share ──────────────────────────────────────────────────────────────────

  async share(short: VideoShort, event: Event): Promise<void> {
    event.stopPropagation();
    const url  = `${location.origin}/shorts/${short._id}`;
    const data = { title: short.title, text: short.caption ?? short.title, url };
    if (isPlatformBrowser(this.platformId) && navigator.share) {
      try { await navigator.share(data); return; } catch { /* cancelled */ }
    }
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
    this.feedRef?.nativeElement.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ── Caption expand ─────────────────────────────────────────────────────────

  isExpanded(id: string): boolean { return this.expandedCaptions().has(id); }

  toggleCaption(id: string, event: Event): void {
    event.stopPropagation();
    this.expandedCaptions.update(s => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
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
    const s = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
    if (s < 60)    return 'just now';
    if (s < 3600)  return `${Math.floor(s / 60)}m`;
    if (s < 86400) return `${Math.floor(s / 3600)}h`;
    return `${Math.floor(s / 86400)}d`;
  }

  formatDuration(s: number | null | undefined): string {
    if (!s) return '';
    return `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, '0')}`;
  }

  trackById(_: number, item: VideoShort): string { return item._id; }
  trackByComment(_: number, c: ShortComment): string { return c._id; }

  goBack(): void {
    const hasPrev = this.router.lastSuccessfulNavigation?.previousNavigation != null;
    hasPrev ? this.location.back() : this.router.navigate(['/']);
  }
}
