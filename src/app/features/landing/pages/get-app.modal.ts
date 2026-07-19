import {
  AfterViewInit, Component, ElementRef, HostListener, Input, Output, EventEmitter,
  PLATFORM_ID, ViewChild, ChangeDetectionStrategy, inject, signal
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';

type DeviceTab = 'android' | 'ios';

@Component({
  selector: 'app-get-app-modal',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="gam-backdrop" (click)="onBackdropClick($event)" role="dialog"
         aria-modal="true" aria-labelledby="gam-title">

      <div class="gam-modal">

        <div class="gam-head">
          <span id="gam-title" class="gam-title">Get the ApnaInsights App</span>
          <button #closeBtn class="gam-x-btn" (click)="close.emit()" aria-label="Close">✕</button>
        </div>

        <div class="gam-tabs" role="tablist">
          <button class="gam-tab" role="tab" [class.gam-tab--active]="activeTab() === 'android'"
                  [attr.aria-selected]="activeTab() === 'android'" (click)="activeTab.set('android')">
            Android
          </button>
          <button class="gam-tab" role="tab" [class.gam-tab--active]="activeTab() === 'ios'"
                  [attr.aria-selected]="activeTab() === 'ios'" (click)="activeTab.set('ios')">
            iPhone / iPad
          </button>
        </div>

        <div class="gam-body">
          @if (activeTab() === 'android') {
            @if (canInstallWebApp) {
              <button class="gam-btn-primary" type="button" (click)="installWebApp.emit(); close.emit()">
                Install as Web App
              </button>
              <p class="gam-hint">Fastest option - installs straight from your browser, no download needed.</p>
              <div class="gam-divider"><span>or</span></div>
            }
            <a class="gam-btn-secondary" href="/downloads/ApnaInsights.apk" download>
              Download APK
            </a>
            <p class="gam-hint">
              After downloading, open the file to install. If prompted, allow installs from this source in your
              phone's settings - this only needs to be done once.
            </p>
          } @else {
            <ol class="gam-steps">
              <li>
                <span class="gam-step-num">1</span>
                <span class="gam-step-text">Tap the <strong>Share</strong> icon in Safari's toolbar.</span>
              </li>
              <li>
                <span class="gam-step-num">2</span>
                <span class="gam-step-text">Scroll down and tap <strong>Add to Home Screen</strong>.</span>
              </li>
              <li>
                <span class="gam-step-num">3</span>
                <span class="gam-step-text">Tap <strong>Add</strong> in the top-right corner.</span>
              </li>
            </ol>
            <p class="gam-hint">This must be done in Safari - other iOS browsers can't add apps to your home screen.</p>
          }
        </div>

      </div>
    </div>
  `,
  styles: [`
    .gam-backdrop {
      position: fixed; inset: 0; z-index: 2000;
      background: rgba(0, 0, 0, 0.55);
      backdrop-filter: blur(4px);
      display: flex; align-items: center; justify-content: center;
      padding: 16px;
      animation: gamFadeIn 0.22s ease both;
    }
    @keyframes gamFadeIn { from { opacity: 0; } to { opacity: 1; } }

    .gam-modal {
      background: var(--bg-surface);
      border: 1px solid var(--border);
      border-radius: 20px;
      width: 100%;
      max-width: 420px;
      max-height: 90dvh;
      max-height: 90vh;
      overflow-y: auto;
      animation: gamSlideUp 0.28s cubic-bezier(0.34, 1.56, 0.64, 1) both;
      box-shadow: 0 24px 64px rgba(0, 0, 0, 0.22);
    }
    @keyframes gamSlideUp {
      from { opacity: 0; transform: translateY(20px) scale(0.97); }
      to   { opacity: 1; transform: translateY(0) scale(1); }
    }

    .gam-head {
      display: flex; justify-content: space-between; align-items: center;
      padding: 18px 20px 12px;
      border-bottom: 1px solid var(--border);
    }
    .gam-title {
      font-family: 'DM Sans', sans-serif;
      font-size: 17px; font-weight: 700;
      color: var(--text-primary);
    }
    .gam-x-btn {
      width: 30px; height: 30px; border-radius: 50%;
      border: 1.5px solid var(--border);
      background: var(--bg-surface-alt); color: var(--text-muted);
      font-size: 14px; cursor: pointer; flex-shrink: 0;
      display: flex; align-items: center; justify-content: center;
      transition: background 0.2s, border-color 0.2s, color 0.2s;
    }
    @media (hover: hover) {
      .gam-x-btn:hover {
        background: color-mix(in srgb, #ef4444 10%, transparent);
        border-color: #ef4444; color: #ef4444;
      }
    }

    .gam-tabs {
      display: flex; gap: 6px;
      padding: 14px 20px 0;
    }
    .gam-tab {
      flex: 1;
      font-size: 13px; font-weight: 600; font-family: 'DM Sans', sans-serif;
      color: var(--text-secondary);
      background: var(--bg-surface-alt);
      border: 1.5px solid var(--border);
      border-radius: 9px;
      padding: 9px 10px;
      cursor: pointer;
      transition: background 0.2s, color 0.2s, border-color 0.2s;
    }
    .gam-tab--active {
      background: var(--accent-hover);
      border-color: var(--accent-hover);
      color: #fff;
    }

    .gam-body { padding: 18px 20px 22px; }

    .gam-btn-primary {
      width: 100%;
      font-size: 14px; font-weight: 700; font-family: 'DM Sans', sans-serif;
      color: #fff;
      background: var(--accent-hover);
      border: none; border-radius: 10px;
      padding: 12px 16px; cursor: pointer;
      transition: opacity 0.2s, transform 0.2s;
    }
    .gam-btn-primary:hover { opacity: 0.92; transform: translateY(-1px); }

    .gam-btn-secondary {
      display: block; width: 100%; box-sizing: border-box;
      text-align: center; text-decoration: none;
      font-size: 14px; font-weight: 700; font-family: 'DM Sans', sans-serif;
      color: var(--text-primary);
      background: var(--bg-surface-alt);
      border: 1.5px solid var(--border);
      border-radius: 10px;
      padding: 12px 16px; cursor: pointer;
      transition: background 0.2s, border-color 0.2s;
    }
    .gam-btn-secondary:hover {
      background: var(--bg-surface);
      border-color: var(--border-strong);
    }

    .gam-hint {
      font-size: 12px; color: var(--text-muted);
      line-height: 1.5; margin: 10px 0 0;
    }

    .gam-divider {
      display: flex; align-items: center; gap: 10px;
      margin: 14px 0;
      font-size: 11px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em;
    }
    .gam-divider::before, .gam-divider::after {
      content: ''; flex: 1; height: 1px; background: var(--border);
    }

    .gam-steps {
      list-style: none; padding: 0; margin: 0;
      display: flex; flex-direction: column; gap: 12px;
    }
    .gam-steps li {
      display: flex; gap: 12px; align-items: flex-start;
    }
    .gam-step-num {
      flex-shrink: 0;
      width: 24px; height: 24px; border-radius: 50%;
      background: var(--accent-hover); color: #fff;
      font-size: 12px; font-weight: 700;
      display: flex; align-items: center; justify-content: center;
    }
    .gam-step-text {
      font-size: 13.5px; color: var(--text-primary); line-height: 1.5; padding-top: 2px;
    }
  `],
})
export class GetAppModal implements AfterViewInit {
  private platformId = inject(PLATFORM_ID);
  private previouslyFocused: HTMLElement | null = null;

  @Input() canInstallWebApp = false;
  @Output() close = new EventEmitter<void>();
  @Output() installWebApp = new EventEmitter<void>();

  @ViewChild('closeBtn') closeBtn?: ElementRef<HTMLButtonElement>;

  activeTab = signal<DeviceTab>('android');

  ngAfterViewInit(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    const ua = navigator.userAgent || '';
    if (/iPhone|iPad|iPod/i.test(ua)) this.activeTab.set('ios');
    this.previouslyFocused = document.activeElement as HTMLElement;
    this.closeBtn?.nativeElement?.focus();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.close.emit();
    if (isPlatformBrowser(this.platformId)) this.previouslyFocused?.focus();
  }

  onBackdropClick(event: MouseEvent): void {
    if ((event.target as Element).classList.contains('gam-backdrop')) {
      this.close.emit();
    }
  }
}
