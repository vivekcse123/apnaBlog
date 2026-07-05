import {
  AfterViewInit, Component, ElementRef, HostListener, Output, EventEmitter,
  PLATFORM_ID, ViewChild, ChangeDetectionStrategy, inject
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { RouterLink } from '@angular/router';

interface Feature {
  icon: string;
  colorClass: string;
  label: string;
  desc: string;
}

@Component({
  selector: 'app-welcome-modal',
  standalone: true,
  imports: [CommonModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="wm-backdrop" (click)="onBackdropClick($event)" role="dialog"
         aria-modal="true" aria-labelledby="wm-title">

      <div class="wm-modal">

        <!-- Always-visible top accent bar -->
        <div class="wm-top-bar"></div>

        <!-- Always-visible header - X button never scrolls away -->
        <div class="wm-head">
          <a class="app-logo" routerLink="/" (click)="close.emit()">
            <img class="app-logo-img" src="/logo-96.png" alt="ApnaInsights" />
            <span class="app-logo-text">ApnaInsights</span>
          </a>
          <button #closeBtn class="wm-x-btn" (click)="close.emit()" aria-label="Close welcome modal">✕</button>
        </div>

        <!-- Scrollable body -->
        <div class="wm-body" (click)="$event.stopPropagation()">

          <h2 id="wm-title" class="wm-title">Welcome to ApnaInsights</h2>
          <p class="wm-sub">India's practical knowledge platform - expert guides, real insights.</p>

          <ul class="wm-features" role="list">
            @for (f of features; track f.label) {
              <li class="wm-feat">
                <span class="wm-feat-icon" [class]="'wm-icon-' + f.colorClass" aria-hidden="true">
                  {{ f.icon }}
                </span>
                <div class="wm-feat-text">
                  <p class="wm-feat-label">{{ f.label }}</p>
                  <p class="wm-feat-desc">{{ f.desc }}</p>
                </div>
              </li>
            }
          </ul>

        </div>

        <!-- Always-visible footer - buttons never scroll away -->
        <div class="wm-footer">
          <button class="wm-btn-secondary" (click)="close.emit()">Maybe later</button>
          <button class="wm-btn-primary" (click)="close.emit()">Start exploring →</button>
        </div>

      </div>
    </div>
  `,
  styles: [`
    /* ── Backdrop ── */
    .wm-backdrop {
      position: fixed; inset: 0; z-index: 2000;
      background: rgba(0, 0, 0, 0.55);
      backdrop-filter: blur(4px);
      display: flex; align-items: center; justify-content: center;
      padding: 16px;
      animation: wmFadeIn 0.22s ease both;
    }

    @keyframes wmFadeIn {
      from { opacity: 0; }
      to   { opacity: 1; }
    }

    /* ── Modal shell - flex column so header+footer stay pinned ── */
    .wm-modal {
      background: var(--bg-surface);
      border: 1px solid var(--border);
      border-radius: 20px;
      width: 100%;
      max-width: 460px;
      /* Constrain height so it never overflows the viewport */
      max-height: 90dvh;          /* dynamic viewport height on modern browsers */
      max-height: 90vh;           /* fallback for older browsers */
      display: flex;
      flex-direction: column;
      overflow: hidden;
      animation: wmSlideUp 0.28s cubic-bezier(0.34, 1.56, 0.64, 1) both;
      box-shadow: 0 24px 64px rgba(0, 0, 0, 0.22);
    }

    @keyframes wmSlideUp {
      from { opacity: 0; transform: translateY(20px) scale(0.97); }
      to   { opacity: 1; transform: translateY(0) scale(1); }
    }

    /* ── Top gradient accent - always at top, never scrolls ── */
    .wm-top-bar {
      flex-shrink: 0;
      height: 4px;
      background: linear-gradient(90deg, #43cea2, #185a9d);
    }

    /* ── Header - pinned, never scrolls away ── */
    .wm-head {
      flex-shrink: 0;
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16px 20px 12px;
      border-bottom: 1px solid var(--border);
    }

    .app-logo {
      display: flex; align-items: center; gap: 8px;
      text-decoration: none;
    }
    .app-logo-img { width: 26px; height: 26px; object-fit: contain; }
    .app-logo-text {
      font-size: 14px; font-weight: 700;
      color: var(--text-primary);
      font-family: 'DM Sans', sans-serif;
    }

    .wm-x-btn {
      width: 32px; height: 32px; border-radius: 50%;
      border: 1.5px solid var(--border);
      background: var(--bg-surface-alt); color: var(--text-muted);
      font-size: 16px; cursor: pointer; flex-shrink: 0;
      display: flex; align-items: center; justify-content: center;
      transition: background 0.2s, border-color 0.2s, color 0.2s, transform 0.2s;
    }
    @media (hover: hover) {
      .wm-x-btn:hover {
        background: color-mix(in srgb, #ef4444 10%, transparent);
        border-color: #ef4444; color: #ef4444; transform: rotate(90deg);
      }
    }

    /* ── Scrollable body ── */
    .wm-body {
      flex: 1;
      overflow-y: auto;
      padding: 18px 20px 4px;
      overscroll-behavior: contain;
      -webkit-overflow-scrolling: touch;
      scrollbar-width: thin;
      scrollbar-color: var(--border) transparent;
    }
    .wm-body::-webkit-scrollbar { width: 4px; }
    .wm-body::-webkit-scrollbar-thumb {
      background: var(--border); border-radius: 99px;
    }

    .wm-title {
      font-family: 'DM Sans', sans-serif;
      font-size: 19px; font-weight: 700;
      color: var(--text-primary);
      margin: 0 0 5px;
    }

    .wm-sub {
      font-size: 13px; color: var(--text-secondary);
      line-height: 1.5; margin: 0 0 14px;
    }

    /* ── Feature list ── */
    .wm-features {
      list-style: none; padding: 0; margin: 0 0 4px;
      display: flex; flex-direction: column; gap: 8px;
    }

    .wm-feat {
      display: flex; gap: 10px; align-items: flex-start;
      background: var(--bg-surface-alt);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 10px 12px;
    }

    .wm-feat-icon {
      width: 32px; height: 32px; border-radius: 7px; flex-shrink: 0;
      display: flex; align-items: center; justify-content: center;
      font-size: 14px;
    }

    .wm-icon-teal   { background: rgba(67, 206, 162, 0.15); }
    .wm-icon-blue   { background: rgba(24, 90, 157, 0.12); }
    .wm-icon-amber  { background: rgba(245, 158, 11, 0.12); }
    .wm-icon-purple { background: rgba(139, 92, 246, 0.12); }

    .wm-feat-label {
      font-size: 12px; font-weight: 700;
      color: var(--text-primary); margin: 0 0 2px;
    }
    .wm-feat-desc {
      font-size: 11px; color: var(--text-muted);
      line-height: 1.45; margin: 0;
    }

    /* ── Footer - pinned, never scrolls away ── */
    .wm-footer {
      flex-shrink: 0;
      display: flex; justify-content: flex-end; align-items: center;
      gap: 8px; padding: 12px 20px;
      border-top: 1px solid var(--border);
    }

    .wm-btn-secondary {
      font-size: 13px; font-weight: 600; font-family: 'DM Sans', sans-serif;
      color: var(--text-secondary); background: transparent;
      border: 1.5px solid var(--border); border-radius: 8px;
      padding: 8px 16px; cursor: pointer;
      transition: background 0.2s, color 0.2s, border-color 0.2s;
      white-space: nowrap;
    }
    .wm-btn-secondary:hover {
      background: var(--bg-surface-alt);
      border-color: var(--border-strong); color: var(--text-primary);
    }

    .wm-btn-primary {
      font-size: 13px; font-weight: 700; font-family: 'DM Sans', sans-serif;
      color: #fff;
      background: linear-gradient(135deg, #43cea2, #185a9d);
      border: none; border-radius: 8px;
      padding: 8px 18px; cursor: pointer;
      white-space: nowrap;
      transition: opacity 0.2s, transform 0.2s, box-shadow 0.2s;
    }
    .wm-btn-primary:hover {
      opacity: 0.9; transform: translateY(-1px);
      box-shadow: 0 6px 18px rgba(67, 206, 162, 0.35);
    }

    /* ── Mobile: bottom sheet ── */
    @media (max-width: 520px) {
      .wm-backdrop {
        align-items: flex-end;
        padding: 0;
      }
      .wm-modal {
        border-radius: 20px 20px 0 0;
        max-width: 100%;
        max-height: 88dvh;
        max-height: 88vh;
      }
      .wm-head { padding: 14px 16px 10px; }
      .wm-body { padding: 14px 16px 4px; }
      .wm-footer {
        padding: 10px 16px;
        flex-direction: row;
        justify-content: space-between;
        padding-bottom: max(10px, env(safe-area-inset-bottom));
      }
      .wm-btn-secondary,
      .wm-btn-primary { flex: 1; text-align: center; }
    }

    /* ── Very small screens (360px wide Android) ── */
    @media (max-width: 380px) {
      .wm-title  { font-size: 17px; }
      .wm-earn-banner { padding: 10px 12px; }
      .wm-earn-icon { font-size: 20px; }
      .wm-feat   { padding: 9px 10px; }
    }
  `],
})
export class WelcomeModal implements AfterViewInit {
  private platformId = inject(PLATFORM_ID);
  private previouslyFocused: HTMLElement | null = null;

  @ViewChild('closeBtn') closeBtn?: ElementRef<HTMLButtonElement>;
  @Output() close = new EventEmitter<void>();

  ngAfterViewInit(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    this.previouslyFocused = document.activeElement as HTMLElement;
    this.closeBtn?.nativeElement?.focus();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.close.emit();
    if (isPlatformBrowser(this.platformId)) this.previouslyFocused?.focus();
  }

  readonly features: Feature[] = [
    {
      icon: '◈',
      colorClass: 'teal',
      label: 'Everything in one place',
      desc: 'Browse stories across 16+ categories - from Sports to Village life.',
    },
    {
      icon: '⚿',
      colorClass: 'blue',
      label: 'Read in your language',
      desc: 'Every article can be translated into Hindi, Marathi, Tamil, Telugu, Malayalam and Kannada - no third-party app needed.',
    },
    {
      icon: '⚡',
      colorClass: 'amber',
      label: 'Fast and reliable',
      desc: 'Optimised loading, lazy rendering and paginated data keep things snappy.',
    },
    {
      icon: '✦',
      colorClass: 'purple',
      label: 'Easy-to-use interface',
      desc: 'Search, filters, bookmarks and keyboard shortcuts - designed to stay out of your way.',
    },
  ];

  onBackdropClick(event: MouseEvent): void {
    if ((event.target as Element).classList.contains('wm-backdrop')) {
      this.close.emit();
    }
  }
}
