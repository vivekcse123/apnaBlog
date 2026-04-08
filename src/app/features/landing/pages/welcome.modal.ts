import {
  Component, Output, EventEmitter,
  ChangeDetectionStrategy
} from '@angular/core';
import { CommonModule } from '@angular/common';

interface Feature {
  icon: string;
  colorClass: string;
  label: string;
  desc: string;
}

@Component({
  selector: 'app-welcome-modal',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="wm-backdrop" (click)="onBackdropClick($event)" role="dialog"
         aria-modal="true" aria-labelledby="wm-title">

      <div class="wm-modal" (click)="$event.stopPropagation()">

        <div class="wm-top-bar"></div>

        <div class="wm-body">
          <div class="wm-head">
            <div class="wm-brand-icon" aria-hidden="true">⬡</div>
            <button class="wm-x-btn" (click)="close.emit()" aria-label="Close welcome modal">✕</button>
          </div>

          <h2 id="wm-title" class="wm-title">Welcome to ApnaInsights</h2>
          <p class="wm-sub">Your community hub for real stories from real people.</p>

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

        <div class="wm-footer">
          <button class="wm-btn-secondary" (click)="close.emit()">Maybe later</button>
          <button class="wm-btn-primary" (click)="close.emit()">Start exploring →</button>
        </div>

      </div>
    </div>
  `,
  styles: [`
    .wm-backdrop {
      position: fixed; inset: 0; z-index: 2000;
      background: rgba(0, 0, 0, 0.5);
      backdrop-filter: blur(4px);
      display: flex; align-items: center; justify-content: center;
      padding: 16px;
      animation: wmFadeIn 0.25s ease both;
    }

    @keyframes wmFadeIn {
      from { opacity: 0; }
      to   { opacity: 1; }
    }

    .wm-modal {
      background: var(--bg-surface);
      border: 1px solid var(--border);
      border-radius: 20px;
      width: 100%; max-width: 480px;
      overflow: hidden;
      animation: wmSlideUp 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) both;
      box-shadow: 0 24px 64px rgba(0, 0, 0, 0.2);
    }

    @keyframes wmSlideUp {
      from { opacity: 0; transform: translateY(24px) scale(0.97); }
      to   { opacity: 1; transform: translateY(0) scale(1); }
    }

    .wm-top-bar {
      height: 4px;
      background: linear-gradient(90deg, #43cea2, #185a9d);
    }

    .wm-body {
      padding: 24px 24px 0;
    }

    .wm-head {
      display: flex; justify-content: space-between; align-items: center;
      margin-bottom: 12px;
    }

    .wm-brand-icon {
      width: 44px; height: 44px; border-radius: 50%;
      background: linear-gradient(135deg, #43cea2, #185a9d);
      display: flex; align-items: center; justify-content: center;
      font-size: 20px; color: #fff;
    }

    .wm-x-btn {
      width: 30px; height: 30px; border-radius: 50%;
      border: 1.5px solid var(--border);
      background: var(--bg-surface-alt); color: var(--text-secondary);
      font-size: 13px; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      transition: background 0.2s, border-color 0.2s, color 0.2s;
    }
    .wm-x-btn:hover {
      background: rgba(239, 68, 68, 0.1);
      border-color: #ef4444; color: #ef4444;
    }

    .wm-title {
      font-family: 'Playfair Display', serif;
      font-size: 22px; font-weight: 700;
      color: var(--text-primary);
      margin: 0 0 6px;
    }

    .wm-sub {
      font-size: 14px; color: var(--text-secondary);
      line-height: 1.55; margin: 0 0 20px;
    }

    .wm-features {
      list-style: none; padding: 0; margin: 0 0 8px;
      display: flex; flex-direction: column; gap: 10px;
    }

    .wm-feat {
      display: flex; gap: 12px; align-items: flex-start;
      background: var(--bg-surface-alt);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 12px 14px;
    }

    .wm-feat-icon {
      width: 36px; height: 36px; border-radius: 8px; flex-shrink: 0;
      display: flex; align-items: center; justify-content: center;
      font-size: 16px;
    }

    .wm-icon-teal   { background: rgba(67, 206, 162, 0.15); }
    .wm-icon-blue   { background: rgba(24, 90, 157, 0.12); }
    .wm-icon-amber  { background: rgba(245, 158, 11, 0.12); }
    .wm-icon-purple { background: rgba(139, 92, 246, 0.12); }

    .wm-feat-label {
      font-size: 13px; font-weight: 700;
      color: var(--text-primary); margin: 0 0 3px;
    }

    .wm-feat-desc {
      font-size: 12px; color: var(--text-muted);
      line-height: 1.5; margin: 0;
    }

    .wm-footer {
      display: flex; justify-content: flex-end; align-items: center;
      gap: 10px; padding: 16px 24px;
      border-top: 1px solid var(--border); margin-top: 16px;
    }

    .wm-btn-secondary {
      font-size: 13px; font-weight: 600; font-family: 'DM Sans', sans-serif;
      color: var(--text-secondary); background: transparent;
      border: 1.5px solid var(--border); border-radius: 8px;
      padding: 8px 18px; cursor: pointer;
      transition: background 0.2s, color 0.2s, border-color 0.2s;
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
      padding: 8px 20px; cursor: pointer;
      transition: opacity 0.2s, transform 0.2s, box-shadow 0.2s;
    }
    .wm-btn-primary:hover {
      opacity: 0.9; transform: translateY(-1px);
      box-shadow: 0 6px 18px rgba(67, 206, 162, 0.35);
    }

    @media (max-width: 520px) {
      .wm-modal { border-radius: 20px 20px 0 0; }
      .wm-backdrop { align-items: flex-end; padding: 0; }
      .wm-footer { flex-direction: column-reverse; }
      .wm-btn-secondary, .wm-btn-primary { width: 100%; text-align: center; }
    }
  `],
})
export class WelcomeModal {
  @Output() close = new EventEmitter<void>();

  readonly features: Feature[] = [
    {
      icon: '◈',
      colorClass: 'teal',
      label: 'Everything in one place',
      desc: 'Browse stories across 12 categories — from Sports to Village life, all in one feed.',
    },
    {
      icon: '⚿',
      colorClass: 'blue',
      label: 'Secure access with JWT authentication',
      desc: 'Your account and data are protected with industry-standard token-based auth.',
    },
    {
      icon: '⚡',
      colorClass: 'amber',
      label: 'Fast and reliable insights',
      desc: 'Optimised loading, lazy rendering and paginated data keep things snappy.',
    },
    {
      icon: '✦',
      colorClass: 'purple',
      label: 'Easy-to-use interface',
      desc: 'Keyboard shortcuts, search, filters, bookmarks — designed to get out of your way.',
    },
  ];

onBackdropClick(event: MouseEvent): void {
  if ((event.target as Element).classList.contains('wm-backdrop')) {
    this.close.emit();
  }
}
}