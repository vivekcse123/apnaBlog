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

  private safeUrlCache = new Map<string, SafeResourceUrl>();

  // ── Public signals ─────────────────────────────────────────────────────────
  shorts              = signal<VideoShort[]>([]);
  isLoading           = signal(false);
  hasMore             = signal(true);
  activeIndex         = signal(0);
  selectedCat         = signal('All');
  showUpload          = signal(false);
  showComments        = signal(false);
  commentShort        = signal<VideoShort | null>(null);
  commentText         = signal('');
  isSending           = signal(false);
  shareMsg            = signal('');
  replyingToId        = signal<string | null>(null);
  replyText           = signal('');
  isReplying          = signal(false);
  deletingId          = signal<string | null>(null);
  playedYtIds         = signal<Set<string>>(new Set());
  likedIds            = signal<Set<string>>(this.loadLikedFromStorage());
  isMuted             = signal(true);   // starts muted; user taps icon to unmute
  needsGesture        = signal(false);
  pauseIndicatorIdx   = signal(-1);
  indicatorIsPlaying  = signal(false);
  likeFlashIdx        = signal(-1);
  holdingIdx          = signal(-1);

  // ── Private state ──────────────────────────────────────────────────────────
  private page                = 1;
  private observer!:          IntersectionObserver;
  private adObserver!:        IntersectionObserver;
  private viewedSet           = new Set<string>();
  private viewTimers          = new Map<number, ReturnType<typeof setTimeout>>();
  private scrollRafId         = 0;
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
  private snapTimer:      ReturnType<typeof setTimeout> | null = null;
  private holdTimer:      ReturnType<typeof setTimeout> | null = null;
  private likeFlashTimer: ReturnType<typeof setTimeout> | null = null;

  // Bound reference kept so we can removeEventListener in ngOnDestroy
  private readonly ytMsgHandler = (e: MessageEvent) => {
    if (!e.data || typeof e.data !== 'string') return;
    try {
      const msg = JSON.parse(e.data);
      // YouTube player fires onReady when the JS player is fully initialised.
      // This is the ONLY reliable trigger on iOS Safari — timeouts alone are not enough.
      if (msg.event !== 'onReady') return;
      if (!this.scrollRef?.nativeElement) return;
      const iframes = this.scrollRef.nativeElement
        .querySelectorAll<HTMLIFrameElement>('.sf-iframe');
      for (const iframe of Array.from(iframes)) {
        if (iframe.contentWindow !== e.source) continue;
        const idx = Number(
          iframe.closest<HTMLElement>('[data-idx]')?.getAttribute('data-idx')
        );
        if (isNaN(idx)) break;
        this.ngZone.run(() => {
          const short = this.shorts()[idx];
          if (!short || this.manuallyPausedYtIds.has(short._id)) return;
          iframe.contentWindow!.postMessage(
            JSON.stringify({ event: 'command', func: 'playVideo', args: '' }), '*'
          );
          if (!this.isMuted() && this.gestureUnlocked) {
            iframe.contentWindow!.postMessage(
              JSON.stringify({ event: 'command', func: 'unMute', args: '' }), '*'
            );
          }
        });
        break;
      }
    } catch { /* non-JSON messages from other origins */ }
  };

  readonly LIKED_KEY     = 'apna_liked_shorts';
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
    // Listen for YouTube player onReady (critical for iOS Safari autoplay)
    this.ngZone.runOutsideAngular(() =>
      window.addEventListener('message', this.ytMsgHandler, { passive: true })
    );
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
    this.adObserver?.disconnect();
    this.viewTimers.forEach(t => clearTimeout(t));
    if (this.scrollRafId)    cancelAnimationFrame(this.scrollRafId);
    if (this.piTimer)        clearTimeout(this.piTimer);
    if (this.snapTimer)      clearTimeout(this.snapTimer);
    if (this.holdTimer)      clearTimeout(this.holdTimer);
    if (this.likeFlashTimer) clearTimeout(this.likeFlashTimer);
    window.removeEventListener('message', this.ytMsgHandler);
  }

  // ── Gesture unlock ─────────────────────────────────────────────────────────

  private setupGestureUnlock(): void {
    const unlock = () => {
      if (this.gestureUnlocked) return;
      this.gestureUnlocked = true;

      if (this.isMuted()) {
        // User preference is muted — just mark gesture as done so pending
        // plays can retry muted. Do NOT touch audio state.
        this.ngZone.run(() => {
          if (this.pendingPlayIdx >= 0) {
            this.autoPlayVideo(this.pendingPlayIdx);
            this.pendingPlayIdx = -1;
          }
        });
        return;
      }

      // Preference is unmuted — unmute synchronously inside the gesture
      // activation window (iOS Safari closes the window at zone boundaries).
      const vid = this.getVideoAt(this.activeIndex());
      if (vid) {
        vid.muted = false;
        if (!vid.paused) vid.play().catch(() => {});
      }

      this.ngZone.run(() => {
        if (vid) {
          this.isMuted.set(vid.muted);
          this.needsGesture.set(vid.muted);
        } else {
          this.isMuted.set(false);
          this.needsGesture.set(false);
        }

        const activeCard = this.scrollRef?.nativeElement
          .querySelector<HTMLElement>(`[data-idx="${this.activeIndex()}"]`);
        activeCard?.querySelector<HTMLIFrameElement>('.sf-iframe')
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

  /**
   * On touchend, predict which card will snap (synchronously, while still inside
   * the browser's user-activation window) and call play() unmuted immediately.
   * iOS Safari only allows unmuted play inside the synchronous gesture handler.
   */
  private setupScrollGesturePlay(): void {
    if (!this.scrollRef) return;
    const container = this.scrollRef.nativeElement;

    container.addEventListener('touchend', () => {
      if (this.isMuted()) return;
      this.gestureUnlocked = true;

      // Unmute every rendered video inside this gesture activation window.
      // No card-index prediction needed — we just flip the property on all of
      // them. Already-playing videos gain audio immediately (same as toggleMute).
      // Videos not yet playing will inherit muted=false when autoPlayVideo runs.
      container.querySelectorAll<HTMLVideoElement>('.short-video')
        .forEach(vid => { vid.muted = false; });
    }, { passive: true });
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
        // Two rAF ≈ 32ms — lets Angular paint before we query the DOM.
        requestAnimationFrame(() => requestAnimationFrame(() => {
          this.observeAll();
          if (reset) this.autoPlayVideo(0);
          this.observeAdCards();
        }));
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
    this.progressBound.clear();
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

  isAdSlot(i: number): boolean {
    return i >= 6 && (i - 6) % 8 === 0;
  }

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
        } catch (_) { /* already initialised */ }
      }
    }, { threshold: 0.5 });
  }

  private observeAdCards(): void {
    if (!this.adObserver || !this.scrollRef) return;
    this.scrollRef.nativeElement
      .querySelectorAll<HTMLElement>('.sf-ad-card')
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
          if (short?.videoType === 'youtube') {
            const card   = this.scrollRef?.nativeElement.querySelector<HTMLElement>(`[data-idx="${idx}"]`);
            const iframe = card?.querySelector<HTMLIFrameElement>('.sf-iframe');
            iframe?.contentWindow?.postMessage(
              JSON.stringify({ event: 'command', func: 'pauseVideo', args: '' }), '*'
            );
          }
          if (short?.videoType === 'upload') {
            const card = this.scrollRef?.nativeElement.querySelector<HTMLElement>(`[data-idx="${idx}"]`);
            card?.querySelector<HTMLVideoElement>('.short-video')?.pause();
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

  /** Preload the next 2 upload videos so swipes feel instant. */
  private preloadAdjacent(currentIdx: number): void {
    for (const offset of [1, 2]) {
      const short = this.shorts()[currentIdx + offset];
      if (short?.videoType !== 'upload') continue;
      const vid = this.getVideoAt(currentIdx + offset);
      if (vid && vid.preload !== 'auto') {
        vid.preload = 'auto';
        vid.load();
      }
    }
  }

  // ── Video playback ─────────────────────────────────────────────────────────

  /** Pause every rendered video/iframe that is NOT the active card. */
  private pauseAllExcept(activeIdx: number): void {
    if (!this.scrollRef?.nativeElement) return;
    const container = this.scrollRef.nativeElement;

    container.querySelectorAll<HTMLVideoElement>('.short-video').forEach(vid => {
      const idx = Number(vid.closest<HTMLElement>('[data-idx]')?.getAttribute('data-idx'));
      if (idx !== activeIdx && !vid.paused) vid.pause();
    });

    container.querySelectorAll<HTMLIFrameElement>('.sf-iframe').forEach(iframe => {
      const idx = Number(iframe.closest<HTMLElement>('[data-idx]')?.getAttribute('data-idx'));
      if (idx !== activeIdx) {
        iframe.contentWindow?.postMessage(
          JSON.stringify({ event: 'command', func: 'pauseVideo', args: '' }), '*'
        );
      }
    });
  }

  autoPlayVideo(cardIdx: number): void {
    const short = this.shorts()[cardIdx];
    if (!short) return;

    // Always stop every other video immediately — don't wait for the observer.
    this.pauseAllExcept(cardIdx);

    if (short.videoType === 'youtube' && short._id) {
      if (this.manuallyPausedYtIds.has(short._id)) return;

      const alreadyMounted = this.playedYtIds().has(short._id);
      if (!alreadyMounted) {
        this.playedYtIds.update(s => new Set([...s, short._id]));
      }

      const sendPlay = () => {
        const card   = this.scrollRef?.nativeElement.querySelector<HTMLElement>(`[data-idx="${cardIdx}"]`);
        const iframe = card?.querySelector<HTMLIFrameElement>('.sf-iframe');
        if (!iframe?.contentWindow) return;
        // Always send playVideo — mobile browsers block iframe autoplay=1 URL param
        iframe.contentWindow.postMessage(
          JSON.stringify({ event: 'command', func: 'playVideo', args: '' }), '*'
        );
        if (!this.isMuted() && this.gestureUnlocked) {
          iframe.contentWindow.postMessage(
            JSON.stringify({ event: 'command', func: 'unMute', args: '' }), '*'
          );
        }
      };

      // For a freshly-mounted iframe, also fire playVideo on the iframe's load event
      // so we don't depend purely on setTimeout for load timing.
      if (!alreadyMounted) {
        requestAnimationFrame(() => requestAnimationFrame(() => {
          const card   = this.scrollRef?.nativeElement.querySelector<HTMLElement>(`[data-idx="${cardIdx}"]`);
          const iframe = card?.querySelector<HTMLIFrameElement>('.sf-iframe');
          iframe?.addEventListener('load', () => this.ngZone.run(sendPlay), { once: true });
        }));
      }

      // Retry attempts cover both "already mounted but paused" and slow-loading iframes
      setTimeout(sendPlay, 300);
      setTimeout(sendPlay, 900);
      setTimeout(sendPlay, 1800);
      return;
    }

    if (this.manuallyPausedSet.has(cardIdx)) return;
    const vid = this.getVideoAt(cardIdx);
    if (!vid) return;

    this.attachProgress(cardIdx, vid);

    if (!vid.paused) {
      // Already playing (HTML autoplay or prior play() call).
      // Apply user preference: setupScrollGesturePlay may have set muted=false
      // on this element already; if not, do it now (works on Android).
      if (this.gestureUnlocked && !this.isMuted()) vid.muted = false;
      this.ngZone.run(() => this.syncMuteState(vid));
      return;
    }

    // Set muted based on user preference. setupScrollGesturePlay already sets
    // vid.muted=false on all elements during each swipe gesture — this just
    // ensures videos that enter without a preceding swipe (e.g. first load)
    // also respect the preference.
    vid.muted = !(this.gestureUnlocked && !this.isMuted());

    vid.play()
      .then(() => this.ngZone.run(() => this.syncMuteState(vid)))
      .catch(() => {
        if (!vid.muted) {
          // Browser blocked unmuted play (strict iOS). Fall back to muted so
          // the video at least plays; setupScrollGesturePlay will unmute on swipe.
          vid.muted = true;
          vid.play()
            .then(() => this.ngZone.run(() => this.syncMuteState(vid)))
            .catch(() => { this.pendingPlayIdx = cardIdx; });
        } else {
          this.pendingPlayIdx = cardIdx;
        }
      });
  }

  /** Sync isMuted signal and needsGesture hint with the video's actual state. */
  private syncMuteState(vid: HTMLVideoElement): void {
    if (!vid.muted) {
      // Gesture handler successfully unmuted — confirm to UI, hide hint.
      this.isMuted.set(false);
      this.needsGesture.set(false);
    } else {
      // Playing muted — show hint only if the user's preference is unmuted.
      this.needsGesture.set(!this.isMuted());
    }
  }

  // ── Touch / click handlers ─────────────────────────────────────────────────

  onCardTouchStart(cardIdx: number, e: TouchEvent): void {
    this.touchStartPos = { x: e.touches[0].clientX, y: e.touches[0].clientY };

    // Don't start the hold timer if the touch landed on a button, link, or
    // the overlay panels — only the raw video/gradient area triggers hold-pause.
    const target = e.target as HTMLElement;
    if (target.closest('button, a, input, .sf-actions, .sf-info')) return;

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

    // Resume if we were in a hold-to-pause
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
    if (dx > 10 || dy > 10) return; // scroll swipe, not a tap

    const target = e.target as HTMLElement;
    if (target.closest('button, a, input, .sf-actions, .sf-info')) return;

    // Double-tap → like
    const now      = Date.now();
    const isDblTap = this.lastTapIdx === cardIdx && now - this.lastTapTime < 300;
    this.lastTapIdx  = cardIdx;
    this.lastTapTime = now;

    if (isDblTap) {
      const short = this.shorts()[cardIdx];
      if (short && this.isLoggedIn()) this.doLike(short);
      this.likeFlashIdx.set(cardIdx);
      if (this.likeFlashTimer) clearTimeout(this.likeFlashTimer);
      this.likeFlashTimer = setTimeout(() =>
        this.ngZone.run(() => this.likeFlashIdx.set(-1)), 900
      );
      return;
    }

    this.lastTouchToggleTime = Date.now();
    this.doToggle(cardIdx, e.currentTarget as HTMLElement);
  }

  onCardClick(cardIdx: number, event: Event): void {
    // Suppress the synthetic click that fires ~300ms after the touchend we handled
    if (Date.now() - this.lastTouchToggleTime < 600) return;
    const target = event.target as HTMLElement;
    if (target.closest('button, a, input, .sf-actions, .sf-info')) return;
    this.doToggle(cardIdx, event.currentTarget as HTMLElement);
  }

  private doToggle(cardIdx: number, cardEl: HTMLElement): void {
    const short = this.shorts()[cardIdx];

    // YouTube — keep iframe mounted, just pause/resume via postMessage
    if (short?.videoType === 'youtube' && short._id && this.playedYtIds().has(short._id)) {
      const iframe = cardEl.querySelector<HTMLIFrameElement>('.sf-iframe');
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

    // Upload video
    const vid = cardEl.querySelector<HTMLVideoElement>('video');
    if (!vid) return;

    // ── Playing muted (autoplay state) → unmute; do NOT pause ──
    if (!vid.paused && vid.muted) {
      vid.muted = false;
      this.gestureUnlocked = true;
      this.ngZone.run(() => {
        this.isMuted.set(vid.muted);          // false if browser allowed it
        this.needsGesture.set(vid.muted);     // hint only if still muted
      });
      this.indicatorIsPlaying.set(true);
      this.flashIndicator(cardIdx);
      return;
    }

    // ── Playing unmuted → pause ──
    if (!vid.paused) {
      this.manuallyPausedSet.add(cardIdx);
      vid.pause();
      this.indicatorIsPlaying.set(false);
      this.flashIndicator(cardIdx);
      return;
    }

    // ── Paused → resume unmuted (always inside a gesture handler) ──
    this.manuallyPausedSet.delete(cardIdx);
    vid.muted = false;
    vid.play()
      .then(() => this.ngZone.run(() => { this.isMuted.set(false); this.needsGesture.set(false); }))
      .catch(() => {});
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
    if (!newMuted) {
      this.gestureUnlocked = true;
      this.needsGesture.set(false);
    }

    if (!this.scrollRef?.nativeElement) return;
    const container = this.scrollRef.nativeElement;

    // Apply to every rendered upload video
    container.querySelectorAll<HTMLVideoElement>('.short-video')
      .forEach(vid => { vid.muted = newMuted; });

    // Apply to every rendered YouTube iframe
    container.querySelectorAll<HTMLIFrameElement>('.sf-iframe')
      .forEach(iframe => {
        iframe.contentWindow?.postMessage(
          JSON.stringify({ event: 'command', func: newMuted ? 'mute' : 'unMute', args: '' }), '*'
        );
      });
  }

  private attachProgress(cardIdx: number, vid: HTMLVideoElement): void {
    if (this.progressBound.has(cardIdx)) return;
    this.progressBound.add(cardIdx);
    const card = this.scrollRef?.nativeElement
      .querySelector<HTMLElement>(`[data-idx="${cardIdx}"]`);
    if (!card) return;
    vid.addEventListener('timeupdate', () => {
      if (vid.duration > 0)
        card.style.setProperty('--vp', `${(vid.currentTime / vid.duration) * 100}%`);
    }, { passive: true });
    vid.addEventListener('ended', () => {
      card.style.setProperty('--vp', '100%');
    }, { passive: true });
  }

  private getVideoAt(cardIdx: number): HTMLVideoElement | null {
    const card = this.scrollRef?.nativeElement
      .querySelector<HTMLElement>(`[data-idx="${cardIdx}"]`);
    return card?.querySelector<HTMLVideoElement>('.short-video') ?? null;
  }

  // ── Like — direct (for double-tap, only adds, never removes) ───────────────

  private doLike(short: VideoShort): void {
    if (this.isLiked(short._id)) return;
    this.likedIds.update(s => { const n = new Set(s); n.add(short._id); return n; });
    this.shorts.update(list =>
      list.map(s => s._id === short._id ? { ...s, likesCount: s.likesCount + 1 } : s)
    );
    this.saveLikedToStorage();
    this.service.likeShort(short._id).subscribe({ error: () => this.revertLike(short, false) });
  }

  // ── YouTube ────────────────────────────────────────────────────────────────

  safeEmbedUrl(youtubeId: string): SafeResourceUrl {
    if (!this.safeUrlCache.has(youtubeId)) {
      this.safeUrlCache.set(
        youtubeId,
        this.sanitizer.bypassSecurityTrustResourceUrl(
          `https://www.youtube.com/embed/${youtubeId}?autoplay=1&mute=1&playsinline=1&rel=0&modestbranding=1&controls=0&enablejsapi=1&origin=${encodeURIComponent(location.origin)}`
        )
      );
    }
    return this.safeUrlCache.get(youtubeId)!;
  }

  youtubeThumbnail(youtubeId: string): string {
    return `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg`;
  }

  isYtPlaying(id: string): boolean { return this.playedYtIds().has(id); }

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

  canDeleteComment(ownerUserId: string | null | undefined): boolean {
    const uid = this.currentUserId();
    if (!uid) return false;
    const short = this.commentShort();
    return short?.user._id === uid || ownerUserId === uid;
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
    const text  = this.replyText().trim();
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
    const text  = this.commentText().trim();
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
    const url  = `${location.origin}/shorts#${short._id}`;
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

  // ── Upload ─────────────────────────────────────────────────────────────────

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
    if (secs < 60)    return 'just now';
    if (secs < 3600)  return `${Math.floor(secs / 60)}m`;
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
  trackByComment(_: number, c: ShortComment): string { return c._id; }

  goBack(): void {
    const hasPrev = this.router.lastSuccessfulNavigation?.previousNavigation != null;
    if (hasPrev) this.location.back();
    else this.router.navigate(['/']);
  }
}
