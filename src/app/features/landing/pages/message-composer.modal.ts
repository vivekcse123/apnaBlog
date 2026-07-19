import {
  AfterViewChecked, Component, ElementRef, HostListener, Input, OnInit, Output, EventEmitter,
  ViewChild, ChangeDetectionStrategy, inject, signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MessageService } from '../../../core/services/message.service';
import { Auth } from '../../../core/services/auth';
import { Message } from '../../../shared/models/message.model';
import { ConfirmModal } from '../../../shared/confirm-modal/confirm-modal';

@Component({
  selector: 'app-message-composer-modal',
  standalone: true,
  imports: [CommonModule, ConfirmModal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mc-backdrop" (click)="onBackdropClick($event)" role="dialog"
         aria-modal="true" aria-labelledby="mc-title">

      <div class="mc-modal">

        <div class="mc-head">
          <div class="mc-head-identity">
            @if (recipientAvatar) {
              <img class="mc-avatar" [src]="recipientAvatar" [alt]="recipientName" width="34" height="34" />
            } @else {
              <span class="mc-avatar mc-avatar-fallback">{{ recipientName.charAt(0).toUpperCase() }}</span>
            }
            <span id="mc-title" class="mc-title">{{ recipientName }}</span>
          </div>
          <div class="mc-head-actions">
            <button class="mc-clear-btn" type="button" (click)="clearChat()" [disabled]="clearingChat()"
                    aria-label="Clear this chat" title="Clear chat">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
            </button>
            <button #closeBtn class="mc-x-btn" (click)="close.emit()" aria-label="Close">✕</button>
          </div>
        </div>

        <div class="mc-thread" #threadEl>
          @if (loadingThread()) {
            <div class="mc-loading"><span></span><span></span><span></span></div>
          } @else if (thread().length === 0) {
            <p class="mc-empty">No messages yet - say hello 👋</p>
          } @else {
            @for (m of thread(); track m._id) {
              <div class="mc-bubble-row" [class.mc-bubble-row--mine]="m.sender === currentUserId()">
                <div class="mc-bubble">{{ m.content }}</div>
              </div>
            }
          }
        </div>

        @if (errorMsg()) {
          <p class="mc-error">{{ errorMsg() }}</p>
        }

        <form class="mc-composer" (submit)="$event.preventDefault(); send()">
          <textarea class="mc-input" placeholder="Write a message…" rows="2" maxlength="2000"
                    [value]="draft()" (input)="draft.set($any($event.target).value)"
                    (keydown.enter)="onEnterKey($event)"></textarea>
          <button class="mc-send-btn" type="submit" [disabled]="sending() || !draft().trim()">
            {{ sending() ? 'Sending…' : 'Send' }}
          </button>
        </form>

      </div>

      <app-confirm-modal
        [show]="showClearConfirm()"
        title="Clear this chat?"
        [message]="'Clear your chat with ' + recipientName + '? This only removes it from your inbox — they will still see the full conversation.'"
        confirmText="Clear chat"
        (confirmed)="confirmClearChat()"
        (cancelled)="showClearConfirm.set(false)" />
    </div>
  `,
  styles: [`
    .mc-backdrop {
      position: fixed; inset: 0; z-index: 2000;
      background: rgba(0, 0, 0, 0.55);
      backdrop-filter: blur(4px);
      display: flex; align-items: center; justify-content: center;
      padding: 16px;
      animation: mcFadeIn 0.22s ease both;
    }
    @keyframes mcFadeIn { from { opacity: 0; } to { opacity: 1; } }

    .mc-modal {
      background: var(--bg-surface);
      border: 1px solid var(--border);
      border-radius: 20px;
      width: 100%;
      max-width: 440px;
      height: 560px;
      max-height: 90dvh;
      max-height: 90vh;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      animation: mcSlideUp 0.28s cubic-bezier(0.34, 1.56, 0.64, 1) both;
      box-shadow: 0 24px 64px rgba(0, 0, 0, 0.22);
    }
    @keyframes mcSlideUp {
      from { opacity: 0; transform: translateY(20px) scale(0.97); }
      to   { opacity: 1; transform: translateY(0) scale(1); }
    }

    .mc-head {
      flex-shrink: 0;
      display: flex; justify-content: space-between; align-items: center;
      padding: 14px 16px;
      border-bottom: 1px solid var(--border);
    }
    .mc-head-identity { display: flex; align-items: center; gap: 10px; min-width: 0; }
    .mc-avatar {
      width: 34px; height: 34px; border-radius: 50%; object-fit: cover; flex-shrink: 0;
    }
    .mc-avatar-fallback {
      display: flex; align-items: center; justify-content: center;
      background: var(--accent-hover); color: #fff;
      font-size: 14px; font-weight: 700;
    }
    .mc-title {
      font-family: 'DM Sans', sans-serif;
      font-size: 15px; font-weight: 700;
      color: var(--text-primary);
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .mc-head-actions { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }

    .mc-x-btn {
      width: 30px; height: 30px; border-radius: 50%;
      border: 1.5px solid var(--border);
      background: var(--bg-surface-alt); color: var(--text-muted);
      font-size: 14px; cursor: pointer; flex-shrink: 0;
      display: flex; align-items: center; justify-content: center;
      transition: background 0.2s, border-color 0.2s, color 0.2s;
    }
    @media (hover: hover) {
      .mc-x-btn:hover {
        background: color-mix(in srgb, #ef4444 10%, transparent);
        border-color: #ef4444; color: #ef4444;
      }
    }

    .mc-clear-btn {
      width: 30px; height: 30px; border-radius: 50%;
      border: 1.5px solid var(--border);
      background: var(--bg-surface-alt); color: var(--text-muted);
      cursor: pointer; flex-shrink: 0;
      display: flex; align-items: center; justify-content: center;
      transition: background 0.2s, border-color 0.2s, color 0.2s;
    }
    .mc-clear-btn:disabled { opacity: 0.5; cursor: not-allowed; }
    @media (hover: hover) {
      .mc-clear-btn:hover {
        background: color-mix(in srgb, #ef4444 10%, transparent);
        border-color: #ef4444; color: #ef4444;
      }
    }

    .mc-thread {
      flex: 1;
      overflow-y: auto;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      scrollbar-width: thin;
      scrollbar-color: var(--border) transparent;
    }
    .mc-loading {
      margin: auto; display: flex; gap: 5px;
    }
    .mc-loading span {
      width: 7px; height: 7px; border-radius: 50%;
      background: var(--text-muted);
      animation: mcBounce 1.1s infinite ease-in-out both;
    }
    .mc-loading span:nth-child(2) { animation-delay: 0.15s; }
    .mc-loading span:nth-child(3) { animation-delay: 0.3s; }
    @keyframes mcBounce { 0%, 80%, 100% { opacity: 0.3; } 40% { opacity: 1; } }

    .mc-empty {
      margin: auto; font-size: 13px; color: var(--text-muted); text-align: center;
    }

    .mc-bubble-row { display: flex; }
    .mc-bubble-row--mine { justify-content: flex-end; }
    .mc-bubble {
      max-width: 78%;
      padding: 9px 12px;
      border-radius: 14px;
      font-size: 13.5px; line-height: 1.45;
      background: var(--bg-surface-alt);
      color: var(--text-primary);
      border: 1px solid var(--border);
      white-space: pre-wrap;
      word-break: break-word;
    }
    .mc-bubble-row--mine .mc-bubble {
      background: var(--accent-hover);
      color: #fff;
      border-color: transparent;
    }

    .mc-error {
      flex-shrink: 0;
      margin: 0; padding: 8px 16px 0;
      font-size: 12px; color: #ef4444;
    }

    .mc-composer {
      flex-shrink: 0;
      display: flex; gap: 8px; align-items: flex-end;
      padding: 12px 16px;
      border-top: 1px solid var(--border);
    }
    .mc-input {
      flex: 1;
      resize: none;
      font: inherit;
      font-size: 13.5px;
      color: var(--text-primary);
      background: var(--bg-surface-alt);
      border: 1.5px solid var(--border);
      border-radius: 12px;
      padding: 9px 12px;
      max-height: 90px;
    }
    .mc-input:focus { outline: none; border-color: var(--accent-hover); }
    .mc-send-btn {
      flex-shrink: 0;
      font-size: 13px; font-weight: 700; font-family: 'DM Sans', sans-serif;
      color: #fff;
      background: var(--accent-hover);
      border: none; border-radius: 10px;
      padding: 10px 16px; cursor: pointer;
      transition: opacity 0.2s;
    }
    .mc-send-btn:disabled { opacity: 0.5; cursor: not-allowed; }
  `],
})
export class MessageComposerModal implements OnInit, AfterViewChecked {
  private messageService = inject(MessageService);
  private auth = inject(Auth);
  private previouslyFocused: HTMLElement | null = null;
  private shouldScroll = false;

  @Input() recipientId: string = '';
  @Input() recipientName: string = '';
  @Input() recipientAvatar: string | null = null;
  @Output() close = new EventEmitter<void>();

  @ViewChild('closeBtn') closeBtn?: ElementRef<HTMLButtonElement>;
  @ViewChild('threadEl') threadEl?: ElementRef<HTMLDivElement>;

  currentUserId = this.auth.userId;

  thread        = signal<Message[]>([]);
  loadingThread = signal(true);
  sending       = signal(false);
  draft         = signal('');
  errorMsg      = signal('');
  clearingChat  = signal(false);
  showClearConfirm = signal(false);

  ngOnInit(): void {
    this.messageService.getThread(this.recipientId).subscribe({
      next: res => {
        this.thread.set(res.data ?? []);
        this.loadingThread.set(false);
        this.shouldScroll = true;
      },
      error: () => {
        this.loadingThread.set(false);
        this.errorMsg.set('Could not load previous messages.');
      },
    });
    this.previouslyFocused = document.activeElement as HTMLElement;
    this.closeBtn?.nativeElement?.focus();
  }

  ngAfterViewChecked(): void {
    if (this.shouldScroll && this.threadEl) {
      this.threadEl.nativeElement.scrollTop = this.threadEl.nativeElement.scrollHeight;
      this.shouldScroll = false;
    }
  }

  send(): void {
    const content = this.draft().trim();
    if (!content || this.sending()) return;
    this.sending.set(true);
    this.errorMsg.set('');

    this.messageService.sendMessage(this.recipientId, content).subscribe({
      next: res => {
        this.thread.set([...this.thread(), res.data]);
        this.draft.set('');
        this.sending.set(false);
        this.shouldScroll = true;
      },
      error: err => {
        this.sending.set(false);
        this.errorMsg.set(err?.error?.message ?? 'Could not send message. Please try again.');
      },
    });
  }

  clearChat(): void {
    if (this.clearingChat()) return;
    this.showClearConfirm.set(true);
  }

  confirmClearChat(): void {
    this.showClearConfirm.set(false);
    this.clearingChat.set(true);
    this.messageService.clearConversation(this.recipientId).subscribe({
      next: () => {
        this.clearingChat.set(false);
        this.thread.set([]);
      },
      error: () => {
        this.clearingChat.set(false);
        this.errorMsg.set('Could not clear this chat. Please try again.');
      },
    });
  }

  onEnterKey(event: Event): void {
    const kbEvent = event as KeyboardEvent;
    if (kbEvent.shiftKey) return;
    kbEvent.preventDefault();
    this.send();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    // The confirm modal has its own Escape handler to cancel itself - don't
    // also close the whole composer out from under it on the same keypress.
    if (this.showClearConfirm()) return;
    this.close.emit();
    this.previouslyFocused?.focus();
  }

  onBackdropClick(event: MouseEvent): void {
    if ((event.target as Element).classList.contains('mc-backdrop')) {
      this.close.emit();
    }
  }
}
