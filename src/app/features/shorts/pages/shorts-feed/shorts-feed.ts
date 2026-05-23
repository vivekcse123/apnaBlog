import {
  AfterViewInit, ChangeDetectionStrategy, Component, ElementRef, HostListener, NgZone, OnDestroy, OnInit, PLATFORM_ID, QueryList, ViewChild, ViewChildren, computed, inject, signal
} from '@angular/core';
import { isPlatformBrowser, CommonModule, Location, DOCUMENT } from '@angular/common';
import { Router, RouterLink, ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Meta, Title } from '@angular/platform-browser';
import { ShortsService } from '../../services/shorts.service';
import { VideoShort, ShortComment } from '../../models/video-short.model';
import { Auth } from '../../../../core/services/auth';
import { ShortsUpload } from '../shorts-upload/shorts-upload';

@Component({
  selector: 'app-shorts-feed',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterLink, FormsModule, ShortsUpload],
  templateUrl: './shorts-feed.html',
  styleUrl: './shorts-feed.css',
})
export class ShortsFeed implements OnInit, AfterViewInit, OnDestroy {
  private service    = inject(ShortsService);
  private auth       = inject(Auth);
  private ngZone     = inject(NgZone);
  private router     = inject(Router);
  private route      = inject(ActivatedRoute);
  private location   = inject(Location);
  private platformId = inject(PLATFORM_ID);
  private doc        = inject(DOCUMENT);
  private titleSvc   = inject(Title);
  private meta       = inject(Meta);

  @ViewChildren('reelCard') cardRefs!: QueryList<ElementRef<HTMLElement>>;
  @ViewChild('reelFeed')    feedRef!:  ElementRef<HTMLElement>;
  @ViewChild('catNav')      catNavRef!: ElementRef<HTMLElement>;

  // ── Signals ────────────────────────────────────────────────────────────────
  shorts             = signal<VideoShort[]>([]);
  isLoading          = signal(false);
  hasMore            = signal(true);
  activeIndex        = signal(0);
  selectedCat        = signal('All');
  showUpload         = signal(false);
  showComments       = signal(false);
  commentShort       = signal<VideoShort | null>(null);
  showLikes          = signal(false);
  likesShort         = signal<VideoShort | null>(null);
  likesList          = signal<{ _id: string; name: string; avatar?: string }[]>([]);
  likesLoading       = signal(false);
  likesTotal         = signal(0);
  commentText        = signal('');
  isSending          = signal(false);
  shareMsg           = signal('');
  replyingToId       = signal<string | null>(null);
  replyText          = signal('');
  isReplying         = signal(false);
  deletingId         = signal<string | null>(null);
  endedCards         = signal<Set<number>>(new Set());
  likedIds           = signal<Set<string>>(this.loadLikedFromStorage());
  isMuted            = signal(false);
  showUnmuteHint     = signal(false);
  showSwipeHint      = signal(false);
  pauseIndicatorIdx  = signal(-1);
  indicatorIsPlaying = signal(false);
  likeFlashIdx       = signal(-1);
  likedPopIdx        = signal(-1);
  holdingIdx         = signal(-1);
  expandedCaptions   = signal<Set<string>>(new Set());
  showSearch         = signal(false);
  searchQuery        = signal('');
  private searchDebounce: ReturnType<typeof setTimeout> | null = null;

  // ── Private state ──────────────────────────────────────────────────────────
  private categoryCache       = new Map<string, VideoShort[]>();
  private page                = 1;
  private observer!:          IntersectionObserver;
  private viewedSet           = new Set<string>();
  private viewTimers          = new Map<number, ReturnType<typeof setTimeout>>();
  private scrollRafId         = 0;
  private scrollSettleTimer:  ReturnType<typeof setTimeout> | null = null;
  private pendingPlayIdx      = -1;
  private manuallyPausedSet   = new Set<number>();
  private gestureUnlocked     = false;
  private progressBound       = new Set<number>();
  private touchStartPos        = { x: 0, y: 0 };
  private lastTouchToggleTime  = 0;
  private lastTapIdx           = -1;
  private lastTapTime          = 0;
  private userExplicitlyMuted  = false;
  private piTimer:          ReturnType<typeof setTimeout> | null = null;
  private holdTimer:        ReturnType<typeof setTimeout> | null = null;
  private likeFlashTimer:   ReturnType<typeof setTimeout> | null = null;
  private seekTimer:        ReturnType<typeof setTimeout> | null = null;
  private unmuteHintTimer:  ReturnType<typeof setTimeout> | null = null;
  private swipeHintTimer:   ReturnType<typeof setTimeout> | null = null;
  private likedPopTimer:    ReturnType<typeof setTimeout> | null = null;
  private targetShortId:  string | null = null;

  // Seek config
  public readonly SEEK_SEC = 10;
  seekIndicator = signal<{ cardIdx: number; dir: 'fwd' | 'bwd' } | null>(null);

  readonly LIKED_KEY     = 'apna_liked_shorts';
  readonly VIEWED_PREFIX = 'apna_viewed_short_';

  isLoggedIn    = computed(() => !!this.auth.token());
  isAdmin       = computed(() => this.auth.isAdmin());
  canCreate     = computed(() => !!this.auth.token());
  currentUserId = computed(() => this.auth.userId());

  categories = [
    'All', 'News', 'Sports', 'Technology', 'Entertainment',
    'Lifestyle', 'Health', 'Business', 'Education',
    'Finance', 'Travel', 'Food', 'Fashion',
    'Fitness', 'Gaming', 'Comedy', 'Motivation',
    'Politics', 'Science', 'Art', 'Music',
  ];

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  ngOnInit(): void {
    this.applyMeta();
    this.targetShortId = this.route.snapshot.fragment ?? null;
    this.loadShorts(true);
    if (isPlatformBrowser(this.platformId)) this.initSwipeHint();
  }

  private initSwipeHint(): void {
    try {
      if (localStorage.getItem('apna_swipe_hint_seen')) return;
      this.swipeHintTimer = setTimeout(() => {
        this.ngZone.run(() => this.showSwipeHint.set(true));
        this.swipeHintTimer = setTimeout(() => {
          this.ngZone.run(() => this.showSwipeHint.set(false));
          try { localStorage.setItem('apna_swipe_hint_seen', '1'); } catch { /* quota */ }
        }, 2500);
      }, 1800);
    } catch { /* private browsing */ }
  }

  private clearUnmuteHint(): void {
    if (this.unmuteHintTimer) { clearTimeout(this.unmuteHintTimer); this.unmuteHintTimer = null; }
    this.showUnmuteHint.set(false);
  }

  private applyMeta(): void {
    this.titleSvc.setTitle('Shorts — Quick Videos & Reels | ApnaInsights');
    const desc = 'Watch short videos across News, Sports, Technology, Entertainment and more on ApnaInsights Shorts.';
    this.meta.updateTag({ name: 'description',        content: desc });
    this.meta.updateTag({ name: 'robots',             content: 'index, follow' });
    this.meta.updateTag({ property: 'og:title',       content: 'ApnaInsights Shorts' });
    this.meta.updateTag({ property: 'og:description', content: desc });
    this.meta.updateTag({ property: 'og:url',         content: 'https://apnainsights.com/shorts' });
    this.meta.updateTag({ property: 'og:type',        content: 'website' });

    const canonical = this.doc.querySelector<HTMLLinkElement>('link[rel="canonical"]')
      ?? (() => {
        const el = this.doc.createElement('link');
        el.setAttribute('rel', 'canonical');
        this.doc.head.appendChild(el);
        return el;
      })();
    canonical.setAttribute('href', 'https://apnainsights.com/shorts');

    const schema = {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: 'ApnaInsights Shorts',
      description: desc,
      url: 'https://apnainsights.com/shorts',
      publisher: { '@type': 'Organization', name: 'ApnaInsights', url: 'https://apnainsights.com' },
    };
    let sd = this.doc.getElementById('shorts-schema') as HTMLScriptElement | null;
    if (!sd) {
      sd = this.doc.createElement('script');
      sd.id   = 'shorts-schema';
      sd.type = 'application/ld+json';
      this.doc.head.appendChild(sd);
    }
    sd.textContent = JSON.stringify(schema);
  }

  ngAfterViewInit(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    this.setupObserver();
    this.cardRefs.changes.subscribe(() => this.observeAll());
    this.setupGestureUnlock();
    this.setupScrollGesturePlay();
    this.setupScrollEndPlay();
    this.initBottomAd();
  }

  private initBottomAd(): void {
    try {
      ((window as any).adsbygoogle = (window as any).adsbygoogle || []).push({});
    } catch { /* AdSense not loaded */ }
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
    this.viewTimers.forEach(t => clearTimeout(t));
    if (this.scrollRafId)       cancelAnimationFrame(this.scrollRafId);
    if (this.scrollSettleTimer) clearTimeout(this.scrollSettleTimer);
    if (this.piTimer)           clearTimeout(this.piTimer);
    if (this.holdTimer)         clearTimeout(this.holdTimer);
    if (this.likeFlashTimer)    clearTimeout(this.likeFlashTimer);
    if (this.seekTimer)         clearTimeout(this.seekTimer);
    if (this.searchDebounce)    clearTimeout(this.searchDebounce);
    if (this.unmuteHintTimer)   clearTimeout(this.unmuteHintTimer);
    if (this.swipeHintTimer)    clearTimeout(this.swipeHintTimer);
    if (this.likedPopTimer)     clearTimeout(this.likedPopTimer);
  }

  // ── Gesture unlock ─────────────────────────────────────────────────────────

  unlockAudio(event?: Event): void {
    event?.stopPropagation();
    this.gestureUnlocked = true;
    this.userExplicitlyMuted = false;
    this.clearUnmuteHint();
    const idx = this.activeIndex();
    const vid = this.getVideoAt(idx);
    if (vid) {
      vid.muted = false;
      this.ngZone.run(() => this.isMuted.set(false));
      if (vid.paused) vid.play().catch(() => {});
    }
    this.ngZone.run(() => {
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
      // Any first interaction satisfies browser autoplay policy — unmute unless user chose mute.
      if (!this.userExplicitlyMuted) {
        this.ngZone.run(() => {
          this.clearUnmuteHint();
          this.showSwipeHint.set(false);
          this.isMuted.set(false);
          const vid = this.getVideoAt(this.activeIndex());
          if (vid) vid.muted = false;
        });
      }
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
      // Scroll is a user gesture — unlock audio immediately on current card.
      if (!this.gestureUnlocked) {
        this.gestureUnlocked = true;
        if (!this.userExplicitlyMuted) {
          this.ngZone.run(() => {
            this.clearUnmuteHint();
            this.showSwipeHint.set(false);
            this.isMuted.set(false);
          });
        }
        const vid = this.getVideoAt(this.activeIndex());
        if (vid && !this.isMuted()) vid.muted = false;
      }
      // Pause all; setupScrollEndPlay will play the correct card unmuted.
      container.querySelectorAll<HTMLVideoElement>('.sf-video').forEach(v => v.pause());
    }, { passive: true });
  }

  private setupScrollEndPlay(): void {
    if (!this.feedRef) return;
    const container = this.feedRef.nativeElement;
    const onSettle = () => {
      const idx = Math.round(container.scrollTop / container.clientHeight);
      // Settling after a scroll = confirmed user gesture → unlock audio.
      this.gestureUnlocked = true;
      this.ngZone.run(() => {
        // Clear browser-forced mute so next video plays with audio (user's default preference).
        if (!this.userExplicitlyMuted) {
          this.clearUnmuteHint();
          this.showSwipeHint.set(false);
          this.isMuted.set(false);
        }
        this.activeIndex.set(idx);
        this.autoPlayVideo(idx);
      });
    };
    if ('onscrollend' in window) {
      container.addEventListener('scrollend', onSettle, { passive: true });
    } else {
      container.addEventListener('scroll', () => {
        if (this.scrollSettleTimer) clearTimeout(this.scrollSettleTimer);
        this.scrollSettleTimer = setTimeout(onSettle, 80);
      }, { passive: true });
    }
  }

  // ── Data ───────────────────────────────────────────────────────────────────

  loadShorts(reset = false): void {
    if (this.isLoading()) return;
    if (reset) { this.page = 1; this.hasMore.set(true); }
    this.isLoading.set(true);
    const cat    = this.selectedCat() === 'All' ? undefined : this.selectedCat();
    const catKey = this.selectedCat();
    const search = this.searchQuery().trim() || undefined;
    this.service.getShorts(this.page, 8, cat, search).subscribe({
      next: res => {
        const items = res.data ?? [];
        // Seed liked IDs from server so previously-liked videos show red heart immediately.
        if (this.isLoggedIn()) {
          const serverLiked = items.filter(s => s.isLikedByMe).map(s => s._id);
          if (serverLiked.length) {
            this.likedIds.update(cur => { const n = new Set(cur); serverLiked.forEach(id => n.add(id)); return n; });
            this.saveLikedToStorage();
          }
        }
        this.shorts.update(cur => {
          if (reset) return items;
          const seen = new Set(cur.map(s => s._id));
          return [...cur, ...items.filter(s => !seen.has(s._id))];
        });
        // Cache first page results per category for instant switching
        if (reset && !search) this.categoryCache.set(catKey, this.shorts());
        this.hasMore.set(this.page < (res.totalPages ?? 1));
        this.page++;
        this.isLoading.set(false);

        if (isPlatformBrowser(this.platformId)) {
          requestAnimationFrame(() => requestAnimationFrame(() => {
            this.observeAll();
            this.resolveDeepLink(reset);
          }));
        }
      },
      error: () => { this.isLoading.set(false); this.hasMore.set(false); },
    });
  }

  private resolveDeepLink(isReset: boolean): void {
    if (this.targetShortId) {
      const idx = this.shorts().findIndex(s => s._id === this.targetShortId);
      if (idx >= 0) {
        this.targetShortId = null;
        this.scrollToCard(idx);
        this.autoPlayVideo(idx);
        return;
      }
      if (this.hasMore()) { this.loadShorts(); return; }
      this.targetShortId = null;
    }
    if (isReset) this.autoPlayVideo(0);
  }

  private scrollToCard(idx: number): void {
    if (!this.feedRef?.nativeElement) return;
    const container = this.feedRef.nativeElement;
    container.scrollTo({ top: idx * container.clientHeight, behavior: 'instant' });
    this.activeIndex.set(idx);
  }

  toggleSearch(): void {
    const opening = !this.showSearch();
    this.showSearch.set(opening);
    if (!opening && this.searchQuery()) { this.searchQuery.set(''); this.resetFeed(); }
  }

  onSearchInput(value: string): void {
    this.searchQuery.set(value);
    if (this.searchDebounce) clearTimeout(this.searchDebounce);
    this.searchDebounce = setTimeout(() => this.resetFeed(), 400);
  }

  watchAgain(): void {
    this.feedRef?.nativeElement.scrollTo({ top: 0, behavior: 'instant' });
    this.resetFeed();
  }

  private resetFeed(): void {
    this.pendingPlayIdx = -1;
    this.viewedSet.clear();
    this.viewTimers.forEach(t => clearTimeout(t));
    this.viewTimers.clear();
    this.manuallyPausedSet.clear();
    this.progressBound.clear();
    this.loadShorts(true);
    if (!this.categoryCache.has(this.selectedCat())) {
      this.feedRef?.nativeElement.scrollTo({ top: 0, behavior: 'instant' });
    }
  }

  onCategorySelect(cat: string): void {
    if (cat === this.selectedCat() && !this.isLoading()) return;
    this.selectedCat.set(cat);
    // Scroll the selected pill to center of the nav bar.
    requestAnimationFrame(() => {
      const nav = this.catNavRef?.nativeElement;
      if (!nav) return;
      const idx = this.categories.indexOf(cat);
      const pill = nav.children[idx] as HTMLElement;
      if (pill) nav.scrollTo({ left: pill.offsetLeft - nav.clientWidth / 2 + pill.offsetWidth / 2, behavior: 'smooth' });
    });
    // Show cached instantly if available
    const cached = this.categoryCache.get(cat);
    if (cached?.length) {
      this.shorts.set(cached);
      this.feedRef?.nativeElement.scrollTo({ top: 0, behavior: 'instant' });
      requestAnimationFrame(() => requestAnimationFrame(() => {
        this.observeAll();
        this.autoPlayVideo(0);
      }));
    }
    this.resetFeed();
  }

  onScroll(): void {
    if (this.scrollRafId) return;
    this.scrollRafId = requestAnimationFrame(() => {
      this.scrollRafId = 0;
      if (!this.feedRef) return;
      const el = this.feedRef.nativeElement;
      if (el.scrollHeight - el.scrollTop - el.clientHeight < el.clientHeight
          && this.hasMore() && !this.isLoading()) this.loadShorts();
    });
  }

  // ── IntersectionObserver ───────────────────────────────────────────────────

  private setupObserver(): void {
    this.observer = new IntersectionObserver(entries => {
      // Collect the best candidate to play from all entries in this batch.
      // IntersectionObserver does not guarantee entry order, so processing
      // each intersecting entry independently causes a race: the last-processed
      // entry wins via pauseAllExcept(), which can leave the wrong card playing.
      let bestPlayIdx = -1;

      for (const e of entries) {
        const idx = Number(e.target.getAttribute('data-idx'));
        if (isNaN(idx)) continue;

        if (!e.isIntersecting || e.intersectionRatio < 0.8) {
          // Card left viewport — pause and clear manual-pause flag so it
          // restarts cleanly when the user scrolls back.
          const vid = this.getVideoAt(idx);
          if (vid && !vid.paused) {
            vid.pause();
            vid.muted = true;
          }
          this.manuallyPausedSet.delete(idx);
          continue;
        }

        // Card is >= 80% visible — pick the one closest to the current
        // scroll position when multiple entries are intersecting in the same batch.
        if (bestPlayIdx === -1) {
          bestPlayIdx = idx;
        } else {
          const container = this.feedRef?.nativeElement;
          if (container && container.clientHeight > 0) {
            const scrollIdx = Math.round(container.scrollTop / container.clientHeight);
            if (Math.abs(idx - scrollIdx) < Math.abs(bestPlayIdx - scrollIdx)) {
              bestPlayIdx = idx;
            }
          }
        }
      }

      if (bestPlayIdx >= 0) {
        this.ngZone.run(() => {
          this.activeIndex.set(bestPlayIdx);
          this.scheduleView(bestPlayIdx);
          this.preloadAdjacent(bestPlayIdx);
          // autoPlayVideo handles mute/unmute based on gestureUnlocked.
          this.autoPlayVideo(bestPlayIdx);
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
        this.shorts.update(list => list.map((s, i) => i === idx ? { ...s, views: s.views + 1 } : s));
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
        // Only hint preload="auto" — avoid calling vid.load() which resets
        // the media element and causes iOS Safari to suspend the active video
        // when too many elements are loading concurrently.
        if (vid && vid.preload !== 'auto') vid.preload = 'auto';
      }
    }
  }

  // ── Video playback ─────────────────────────────────────────────────────────

  private pauseAllExcept(activeIdx: number): void {
    if (!this.feedRef?.nativeElement) return;
    this.feedRef.nativeElement.querySelectorAll<HTMLVideoElement>('.sf-video').forEach(vid => {
      const idx = Number(vid.closest<HTMLElement>('[data-idx]')?.getAttribute('data-idx'));
      if (idx !== activeIdx && !vid.paused) {
        vid.pause();
        vid.muted = true;
      }
    });
  }

  private attachProgress(cardIdx: number, vid: HTMLVideoElement): void {
    if (this.progressBound.has(cardIdx)) return;
    this.progressBound.add(cardIdx);
    const card = this.feedRef?.nativeElement.querySelector<HTMLElement>(`[data-idx="${cardIdx}"]`);
    if (!card) return;
    vid.addEventListener('timeupdate', () => {
      if (vid.duration > 0) {
        const n = vid.currentTime / vid.duration;
        card.style.setProperty('--vp',   `${n * 100}%`);
        card.style.setProperty('--vp-n', `${n}`);
      }
    }, { passive: true });
    vid.addEventListener('ended', () => {
      card.style.setProperty('--vp', '100%');
      this.ngZone.run(() => this.endedCards.update(s => new Set([...s, cardIdx])));
    }, { passive: true });
  }

  autoPlayVideo(cardIdx: number): void {
    const short = this.shorts()[cardIdx];
    if (!short) return;
    this.pauseAllExcept(cardIdx);
    if (this.endedCards().has(cardIdx)) {
      this.endedCards.update(s => { const n = new Set(s); n.delete(cardIdx); return n; });
    }
    if (this.manuallyPausedSet.has(cardIdx)) return;
    const vid = this.getVideoAt(cardIdx);
    if (!vid) return;
    this.attachProgress(cardIdx, vid);
    if (!vid.paused) {
      // Already playing — ensure mute state matches user preference.
      const shouldMute = !this.gestureUnlocked || this.isMuted();
      if (vid.muted !== shouldMute) vid.muted = shouldMute;
      return;
    }
    // Unmuted when user has already scrolled/tapped (gesture unlocked).
    // Muted on very first autoplay — browser requires it before any interaction.
    vid.muted = !this.gestureUnlocked || this.isMuted();
    vid.play()
      .then(() => {
        // Only reflect the muted state when it's browser-forced (gesture not yet unlocked).
        // After gesture unlock, isMuted already reflects the user's explicit preference.
        if (!this.gestureUnlocked) {
          this.ngZone.run(() => {
            this.isMuted.set(true);
            // Show "tap to unmute" hint for 3s on the first muted video.
            if (!this.showUnmuteHint()) {
              this.showUnmuteHint.set(true);
              this.unmuteHintTimer = setTimeout(() => {
                this.ngZone.run(() => this.showUnmuteHint.set(false));
              }, 3000);
            }
          });
        }
      })
      .catch(() => {
        // Play failed — retry muted without changing user's mute preference.
        vid.muted = true;
        vid.play()
          .then(() => {
            if (!this.gestureUnlocked) {
              this.ngZone.run(() => this.isMuted.set(true));
            }
          })
          .catch(() => { this.pendingPlayIdx = cardIdx; });
      });
  }

  // ── Touch handlers ─────────────────────────────────────────────────────────

  onCardTouchStart(cardIdx: number, e: TouchEvent): void {
    this.touchStartPos = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    const target = e.target as HTMLElement;
    if (target.closest('button, a, input, .reel-actions, .reel-info')) return;
    if (this.holdTimer) clearTimeout(this.holdTimer);
    this.holdTimer = setTimeout(() => {
      const vid = (e.currentTarget as HTMLElement).querySelector<HTMLVideoElement>('video');
      if (vid && !vid.paused) vid.pause();
      this.ngZone.run(() => this.holdingIdx.set(cardIdx));
    }, 400);
  }

  onCardTouchEnd(cardIdx: number, e: TouchEvent): void {
    if (this.holdTimer) { clearTimeout(this.holdTimer); this.holdTimer = null; }
    if (this.holdingIdx() === cardIdx) {
      this.holdingIdx.set(-1);
      if (!this.manuallyPausedSet.has(cardIdx)) {
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
    const isDblTap = this.lastTapIdx === cardIdx && now - this.lastTapTime < 350;
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

    // First-ever tap: let setupGestureUnlock handle the unmute — don't pause the video.
    if (!this.gestureUnlocked) return;

    this.lastTouchToggleTime = Date.now();
    this.doToggle(cardIdx, e.currentTarget as HTMLElement);
  }

  onCardClick(cardIdx: number, event: Event): void {
    if (Date.now() - this.lastTouchToggleTime < 600) return;
    // First-ever click: let setupGestureUnlock handle the unmute — don't pause the video.
    if (!this.gestureUnlocked) return;
    const target = event.target as HTMLElement;
    if (target.closest('button, a, input, .reel-actions, .reel-info, .reel-progress-track')) return;
    this.doToggle(cardIdx, event.currentTarget as HTMLElement);
  }

  doTogglePublic(cardIdx: number, event: Event): void {
    this.doToggle(cardIdx, (event.currentTarget as HTMLElement).closest('[data-idx]') as HTMLElement
      ?? this.feedRef?.nativeElement.querySelector<HTMLElement>(`[data-idx="${cardIdx}"]`)!);
  }

  private doToggle(cardIdx: number, cardEl: HTMLElement): void {
    // Replay if ended
    if (this.endedCards().has(cardIdx)) {
      this.endedCards.update(s => { const n = new Set(s); n.delete(cardIdx); return n; });
      const vid = cardEl.querySelector<HTMLVideoElement>('video');
      if (vid) {
        this.manuallyPausedSet.delete(cardIdx);
        vid.currentTime = 0;
        vid.muted = this.isMuted();
        vid.play().catch(() => {});
      }
      this.indicatorIsPlaying.set(true);
      this.flashIndicator(cardIdx);
      return;
    }

    // Normal toggle
    const vid = cardEl.querySelector<HTMLVideoElement>('video');
    if (!vid) return;
    if (!vid.paused) {
      this.manuallyPausedSet.add(cardIdx);
      vid.pause();
      this.indicatorIsPlaying.set(false);
    } else {
      this.manuallyPausedSet.delete(cardIdx);
      vid.muted = this.isMuted();
      vid.play().catch(() => {});
      this.indicatorIsPlaying.set(true);
    }
    this.flashIndicator(cardIdx);
  }

  seekVideo(cardIdx: number, delta: number, cardEl: HTMLElement): void {
    const vid = cardEl.querySelector<HTMLVideoElement>('video');
    if (!vid) return;
    vid.currentTime = Math.max(0, Math.min(vid.currentTime + delta, vid.duration || 0));
    if (vid.paused && !this.manuallyPausedSet.has(cardIdx)) vid.play().catch(() => {});
    this.showSeekIndicator(cardIdx, delta > 0 ? 'fwd' : 'bwd');
  }

  onProgressSeek(cardIdx: number, event: MouseEvent | TouchEvent): void {
    event.stopPropagation();
    const track   = event.currentTarget as HTMLElement;
    const rect    = track.getBoundingClientRect();
    const clientX = event instanceof MouseEvent
      ? event.clientX
      : (event as TouchEvent).changedTouches[0]?.clientX ?? rect.left;
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const cardEl = this.feedRef?.nativeElement.querySelector<HTMLElement>(`[data-idx="${cardIdx}"]`);
    if (!cardEl) return;
    cardEl.style.setProperty('--vp', `${ratio * 100}%`);
    const vid = cardEl.querySelector<HTMLVideoElement>('video');
    if (vid) {
      vid.currentTime = ratio * (vid.duration || 0);
      if (vid.paused && !this.manuallyPausedSet.has(cardIdx)) vid.play().catch(() => {});
    }
  }

  private showSeekIndicator(cardIdx: number, dir: 'fwd' | 'bwd'): void {
    this.seekIndicator.set({ cardIdx, dir });
    if (this.seekTimer) clearTimeout(this.seekTimer);
    this.seekTimer = setTimeout(() => this.ngZone.run(() => this.seekIndicator.set(null)), 700);
  }

  private flashIndicator(cardIdx: number): void {
    this.pauseIndicatorIdx.set(cardIdx);
    if (this.piTimer) clearTimeout(this.piTimer);
    this.piTimer = setTimeout(() => this.ngZone.run(() => this.pauseIndicatorIdx.set(-1)), 700);
  }

  toggleMute(event: Event): void {
    event.stopPropagation();
    const newMuted = !this.isMuted();
    this.userExplicitlyMuted = newMuted;
    this.isMuted.set(newMuted);
    if (!newMuted) { this.gestureUnlocked = true; }
    if (!this.feedRef?.nativeElement) return;
    this.feedRef.nativeElement.querySelectorAll<HTMLVideoElement>('.sf-video').forEach(vid => { vid.muted = newMuted; });
  }

  private getVideoAt(cardIdx: number): HTMLVideoElement | null {
    return this.feedRef?.nativeElement
      .querySelector<HTMLElement>(`[data-idx="${cardIdx}"]`)
      ?.querySelector<HTMLVideoElement>('.sf-video') ?? null;
  }

  // ── Like ───────────────────────────────────────────────────────────────────

  private doLike(short: VideoShort): void {
    if (this.isLiked(short._id)) return;
    this.likedIds.update(s => { const n = new Set(s); n.add(short._id); return n; });
    this.shorts.update(list => list.map(s => s._id === short._id ? { ...s, likesCount: s.likesCount + 1 } : s));
    this.saveLikedToStorage();
    this.haptic(40);
    this.service.likeShort(short._id).subscribe({ error: () => this.revertLike(short, false) });
  }

  private haptic(ms: number): void {
    if (isPlatformBrowser(this.platformId) && 'vibrate' in navigator) {
      navigator.vibrate(ms);
    }
  }

  isLiked(id: string): boolean { return this.likedIds().has(id); }

  likedByText(short: VideoShort): string {
    const likers = short.recentLikers ?? [];
    if (!likers.length) return '';
    const first = likers[likers.length - 1].name.split(' ')[0];
    const others = short.likesCount - 1;
    if (others <= 0) return `Liked by ${first}`;
    return `Liked by ${first} and ${others.toLocaleString()} other${others > 1 ? 's' : ''}`;
  }

  toggleLike(short: VideoShort, event: Event): void {
    event.stopPropagation();
    if (!this.isLoggedIn()) { this.router.navigate(['/auth/login']); return; }
    const liked = this.isLiked(short._id);
    const idx   = this.shorts().findIndex(s => s._id === short._id);
    this.likedIds.update(s => { const n = new Set(s); liked ? n.delete(short._id) : n.add(short._id); return n; });
    this.shorts.update(list => list.map(s => s._id === short._id ? { ...s, likesCount: s.likesCount + (liked ? -1 : 1) } : s));
    this.saveLikedToStorage();
    if (!liked) {
      this.haptic(40);
      this.likedPopIdx.set(idx);
      if (this.likedPopTimer) clearTimeout(this.likedPopTimer);
      this.likedPopTimer = setTimeout(() => this.ngZone.run(() => this.likedPopIdx.set(-1)), 500);
    } else {
      this.haptic(15);
    }
    (liked ? this.service.unlikeShort(short._id) : this.service.likeShort(short._id))
      .subscribe({ error: () => this.revertLike(short, liked) });
  }

  private revertLike(short: VideoShort, wasLiked: boolean): void {
    this.likedIds.update(s => { const n = new Set(s); wasLiked ? n.add(short._id) : n.delete(short._id); return n; });
    this.shorts.update(list => list.map(s => s._id === short._id ? { ...s, likesCount: s.likesCount + (wasLiked ? 1 : -1) } : s));
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

  // ── Comments ───────────────────────────────────────────────────────────────

  openLikes(short: VideoShort, event: Event): void {
    event.stopPropagation();
    if (!short.likesCount) return;
    this.likesShort.set(short);
    this.likesList.set([]);
    this.likesTotal.set(short.likesCount);
    this.showLikes.set(true);
    this.likesLoading.set(true);
    this.service.getLikes(short._id).subscribe({
      next: res => { this.likesList.set(res.data ?? []); this.likesTotal.set(res.total); this.likesLoading.set(false); },
      error: () => this.likesLoading.set(false),
    });
  }

  closeLikes(): void { this.showLikes.set(false); this.likesShort.set(null); }

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
              ? { ...c, replies: (c.replies ?? []).filter(r => r._id !== replyId) } : c) }
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
                ? { ...c, replies: [...(c.replies ?? []), newReply] } : c) }
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
    if (!this.canCreate()) return;
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
    this.expandedCaptions.update(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  onVideoData(event: Event): void {
    (event.target as HTMLVideoElement).classList.add('sf-video--ready');
  }

  formatCount(n: number): string {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
    if (n >= 1_000)     return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'k';
    return String(n);
  }

  userInitial(user: VideoShort['user']): string { return (user?.name ?? '?').charAt(0).toUpperCase(); }

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

  // ── Keyboard shortcuts (desktop) ───────────────────────────────────────────
  @HostListener('document:keydown', ['$event'])
  onKeyDown(e: KeyboardEvent): void {
    if (!isPlatformBrowser(this.platformId)) return;
    const tag = (e.target as HTMLElement).tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (this.showComments() || this.showLikes() || this.showUpload()) return;
    const idx = this.activeIndex();
    switch (e.key) {
      case ' ': case 'k':
        e.preventDefault();
        this.doTogglePublic(idx, e as any);
        break;
      case 'ArrowDown': case 'j':
        e.preventDefault();
        this.navigateCard(1);
        break;
      case 'ArrowUp': case 'i':
        e.preventDefault();
        this.navigateCard(-1);
        break;
      case 'm': case 'M':
        this.toggleMute(e as any);
        break;
      case 'l': case 'L': {
        const short = this.shorts()[idx];
        if (short && this.isLoggedIn()) this.toggleLike(short, e as any);
        break;
      }
    }
  }

  private navigateCard(delta: number): void {
    const next = Math.max(0, Math.min(this.activeIndex() + delta, this.shorts().length - 1));
    if (next === this.activeIndex()) return;
    this.scrollToCard(next);
    this.autoPlayVideo(next);
  }
}
