import {
  ChangeDetectionStrategy, Component, DestroyRef, OnInit, AfterViewChecked,
  ViewChild, ElementRef, inject, signal, computed
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MessageService } from '../../../../core/services/message.service';
import { UserService } from '../../services/user-service';
import { Auth } from '../../../../core/services/auth';
import { Conversation, Message } from '../../../../shared/models/message.model';
import { ConfirmModal } from '../../../../shared/confirm-modal/confirm-modal';

interface ThreadPartner {
  _id:    string;
  name:   string;
  avatar: string | null;
}

@Component({
  selector: 'app-messages',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ConfirmModal],
  templateUrl: './messages.html',
  styleUrl: './messages.css',
})
export class Messages implements OnInit, AfterViewChecked {
  private messageService = inject(MessageService);
  private userService    = inject(UserService);
  private auth            = inject(Auth);
  private route            = inject(ActivatedRoute);
  private destroyRef      = inject(DestroyRef);
  private shouldScroll    = false;

  @ViewChild('threadEl') threadEl?: ElementRef<HTMLDivElement>;

  currentUserId = this.auth.userId;

  conversations        = this.messageService.conversations;
  loadingConversations = signal(true);

  selectedPartner = signal<ThreadPartner | null>(null);
  thread          = signal<Message[]>([]);
  loadingThread   = signal(false);
  draft           = signal('');
  sending         = signal(false);
  errorMsg        = signal('');
  clearingChat    = signal(false);
  showClearConfirm = signal(false);

  hasConversations = computed(() => this.conversations().length > 0);

  ngOnInit(): void {
    this.loadConversations();

    const withId = this.route.snapshot.queryParamMap.get('with');
    if (withId) this.openThreadWithId(withId);
  }

  ngAfterViewChecked(): void {
    if (this.shouldScroll && this.threadEl) {
      this.threadEl.nativeElement.scrollTop = this.threadEl.nativeElement.scrollHeight;
      this.shouldScroll = false;
    }
  }

  private loadConversations(): void {
    this.loadingConversations.set(true);
    this.messageService.getConversations()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.loadingConversations.set(false),
        error: () => this.loadingConversations.set(false),
      });
  }

  selectConversation(c: Conversation): void {
    this.openThread({ _id: c.otherUser._id, name: c.otherUser.name, avatar: c.otherUser.avatar });
  }

  // Deep-link path (?with=<id>) - the other user may not be an existing
  // conversation yet, so fetch their basic profile to render the thread header.
  private openThreadWithId(userId: string): void {
    const existing = this.conversations().find(c => c.otherUser._id === userId);
    if (existing) {
      this.openThread({ _id: existing.otherUser._id, name: existing.otherUser.name, avatar: existing.otherUser.avatar });
      return;
    }
    this.userService.getUserById(userId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: res => {
          const u = res.data as any;
          if (!u) return;
          this.openThread({ _id: u._id, name: u.name, avatar: u.avatar ?? null });
        },
      });
  }

  private openThread(partner: ThreadPartner): void {
    this.selectedPartner.set(partner);
    this.thread.set([]);
    this.loadingThread.set(true);
    this.errorMsg.set('');

    this.messageService.getThread(partner._id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: res => {
          this.thread.set(res.data ?? []);
          this.loadingThread.set(false);
          this.shouldScroll = true;
          // The server just marked this thread's messages as read - reflect
          // that in the conversation list without a full re-fetch.
          this.messageService.conversations.set(
            this.conversations().map(c =>
              c.otherUser._id === partner._id ? { ...c, unreadCount: 0 } : c
            )
          );
        },
        error: () => {
          this.loadingThread.set(false);
          this.errorMsg.set('Could not load this conversation.');
        },
      });
  }

  send(): void {
    const partner = this.selectedPartner();
    const content  = this.draft().trim();
    if (!partner || !content || this.sending()) return;

    this.sending.set(true);
    this.errorMsg.set('');

    this.messageService.sendMessage(partner._id, content)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: res => {
          this.thread.set([...this.thread(), res.data]);
          this.draft.set('');
          this.sending.set(false);
          this.shouldScroll = true;
          this.loadConversations();
        },
        error: err => {
          this.sending.set(false);
          this.errorMsg.set(err?.error?.message ?? 'Could not send message. Please try again.');
        },
      });
  }

  clearChat(): void {
    if (!this.selectedPartner() || this.clearingChat()) return;
    this.showClearConfirm.set(true);
  }

  confirmClearChat(): void {
    const partner = this.selectedPartner();
    this.showClearConfirm.set(false);
    if (!partner) return;

    this.clearingChat.set(true);
    this.messageService.clearConversation(partner._id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.clearingChat.set(false);
          this.selectedPartner.set(null);
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

  timeAgo(date: string): string {
    const s = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
    if (s < 60)    return 'just now';
    if (s < 3600)  return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    return `${Math.floor(s / 86400)}d ago`;
  }
}
