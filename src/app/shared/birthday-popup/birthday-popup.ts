import {
  ChangeDetectionStrategy, Component, ElementRef, HostListener, OnDestroy, OnInit,
  PLATFORM_ID, ViewChild, inject, signal
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';

// Event window - a self-contained, hardcoded "special event" for now.
// The active window is the visitor's local calendar date; it goes quiet on
// its own once the clock rolls past END_DATE, no deploy needed.
const START_DATE = '2026-07-06';
const END_DATE = '2026-07-06';
const PERSON_NAME = 'Revathi Satya';
const PERSON_TITLE = 'CEO & Founder';

const BANNER_DISMISSED_KEY = 'apna_bday_banner_dismissed_' + START_DATE;
const WISH_SENT_KEY = 'apna_bday_wish_sent_' + START_DATE;
const WISHES_KEY = 'apna_bday_wishes_' + START_DATE;
const AUTO_OPENED_KEY = 'apna_bday_auto_opened_' + START_DATE;

// Exported so the home page can skip scheduling its own first-visit "Welcome"
// modal on days this celebration is active - two auto-popups stacked on a
// first visit is bad UX, and this check has no init-order race the way a
// sessionStorage handshake between sibling components would.
export function isBirthdayEventActiveToday(): boolean {
  const now = new Date();
  const localDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  return localDate >= START_DATE && localDate <= END_DATE;
}

interface Petal {
  left: number;
  delay: number;
  duration: number;
  size: number;
  rotate: number;
  glyph: string;
}

interface ConfettiPiece {
  left: number;
  delay: number;
  duration: number;
  size: number;
  rotate: number;
  hue: number;
}

const FLOWER_GLYPHS = ['🌸', '🌺', '🌼', '🌷', '💮', '🌹', '🏵️'];

@Component({
  selector: 'app-birthday-popup',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  templateUrl: './birthday-popup.html',
  styleUrl: './birthday-popup.css'
})
export class BirthdayPopup implements OnInit, OnDestroy {
  private platformId = inject(PLATFORM_ID);
  private petalTimer?: ReturnType<typeof setTimeout>;
  private confettiTimer?: ReturnType<typeof setTimeout>;
  private activationPoll?: ReturnType<typeof setInterval>;
  private previouslyFocused: HTMLElement | null = null;
  private reducedMotion = false;

  @ViewChild('closeBtn') closeBtn?: ElementRef<HTMLButtonElement>;

  readonly personName = PERSON_NAME;
  readonly personTitle = PERSON_TITLE;

  eventActive = signal(false);
  bannerVisible = signal(false);
  floatingVisible = signal(false);
  modalOpen = signal(false);
  showPetals = signal(false);
  showConfetti = signal(false);
  wishSent = signal(false);
  wishText = signal('');

  petals: Petal[] = [];
  confetti: ConfettiPiece[] = [];

  ngOnInit(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    this.reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

    if (this.localDateString() >= START_DATE) {
      this.activate();
      return;
    }

    // Tab was opened before the event window - poll so it flips on live the
    // moment the visitor's clock crosses midnight into START_DATE, without
    // needing a reload.
    this.activationPoll = setInterval(() => {
      if (this.localDateString() >= START_DATE) {
        clearInterval(this.activationPoll);
        this.activate();
      }
    }, 30000);
  }

  ngOnDestroy(): void {
    if (this.petalTimer) clearTimeout(this.petalTimer);
    if (this.confettiTimer) clearTimeout(this.confettiTimer);
    if (this.activationPoll) clearInterval(this.activationPoll);
  }

  private localDateString(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }

  private activate(): void {
    const localDate = this.localDateString();
    if (localDate > END_DATE) return;

    this.eventActive.set(true);
    this.wishSent.set(!!localStorage.getItem(WISH_SENT_KEY));

    if (!localStorage.getItem(BANNER_DISMISSED_KEY)) {
      this.bannerVisible.set(true);
    } else {
      this.floatingVisible.set(true);
    }

    if (!localStorage.getItem(AUTO_OPENED_KEY)) {
      localStorage.setItem(AUTO_OPENED_KEY, '1');
      setTimeout(() => this.openModal(), 900);
    }
  }

  dismissBanner(): void {
    if (isPlatformBrowser(this.platformId)) {
      localStorage.setItem(BANNER_DISMISSED_KEY, '1');
    }
    this.bannerVisible.set(false);
    this.floatingVisible.set(true);
  }

  openModal(): void {
    if (isPlatformBrowser(this.platformId)) {
      this.previouslyFocused = document.activeElement as HTMLElement;
    }
    this.modalOpen.set(true);
    this.spawnPetals();
    queueMicrotask(() => this.closeBtn?.nativeElement?.focus());
  }

  closeModal(): void {
    this.modalOpen.set(false);
    this.showPetals.set(false);
    if (this.petalTimer) clearTimeout(this.petalTimer);
    if (isPlatformBrowser(this.platformId)) this.previouslyFocused?.focus();
  }

  onBackdropClick(event: MouseEvent): void {
    if ((event.target as Element).classList.contains('bday-backdrop')) {
      this.closeModal();
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.modalOpen()) this.closeModal();
  }

  private spawnPetals(): void {
    if (this.reducedMotion) return;

    this.petals = Array.from({ length: 50 }, () => ({
      left: Math.random() * 100,
      delay: Math.random() * 1.6,
      duration: 4 + Math.random() * 3.5,
      size: 14 + Math.random() * 14,
      rotate: Math.random() * 360,
      glyph: FLOWER_GLYPHS[Math.floor(Math.random() * FLOWER_GLYPHS.length)],
    }));
    this.showPetals.set(true);

    this.petalTimer = setTimeout(() => this.showPetals.set(false), 8000);
  }

  submitWish(): void {
    const text = this.wishText().trim();
    if (!text || !isPlatformBrowser(this.platformId)) return;

    try {
      const existing = JSON.parse(localStorage.getItem(WISHES_KEY) ?? '[]');
      existing.push({ text, at: new Date().toISOString() });
      localStorage.setItem(WISHES_KEY, JSON.stringify(existing));
    } catch {
      // ignore malformed local storage - not critical
    }

    localStorage.setItem(WISH_SENT_KEY, '1');
    this.wishSent.set(true);
    this.wishText.set('');

    if (!this.reducedMotion) {
      this.confetti = Array.from({ length: 20 }, () => ({
        left: Math.random() * 100,
        delay: Math.random() * 0.3,
        duration: 1 + Math.random() * 0.6,
        size: 6 + Math.random() * 6,
        rotate: Math.random() * 360,
        hue: Math.random() * 360,
      }));
      this.showConfetti.set(true);
      this.confettiTimer = setTimeout(() => this.showConfetti.set(false), 1500);
    }
  }
}
