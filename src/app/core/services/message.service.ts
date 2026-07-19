import { Injectable, inject, signal, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Observable, tap, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Conversation, Message, ThreadResponse } from '../../shared/models/message.model';

interface ConversationsResponse {
  status:  number;
  message: string;
  data:    Conversation[];
}

interface SendMessageResponse {
  status:  number;
  message: string;
  data:    Message;
}

// Client-side-only guard against runaway sending. This is a UX nudge, not a
// security control - it lives in localStorage, so it's scoped to one browser
// and trivially reset. Real abuse prevention has to be enforced server-side
// (a 429 there would surface through the same err?.error?.message path the
// composer UIs already read, so no frontend change would be needed for that).
const DAILY_MESSAGE_LIMIT = 20;
const DAILY_COUNT_STORAGE_KEY = 'msg_daily_send_count';

@Injectable({ providedIn: 'root' })
export class MessageService {
  private http       = inject(HttpClient);
  private platformId = inject(PLATFORM_ID);
  private endpoint   = environment.apiMessagesEndpoint;

  /** Last-fetched conversation list - shared so the dashboard page doesn't
   *  need to re-request it on every navigation. */
  conversations = signal<Conversation[]>([]);

  sendMessage(recipientId: string, content: string): Observable<SendMessageResponse> {
    if (this._sentToday() >= DAILY_MESSAGE_LIMIT) {
      return throwError(() => ({
        error: { message: `You've reached today's limit of ${DAILY_MESSAGE_LIMIT} messages. Try again tomorrow.` },
      }));
    }
    return this.http.post<SendMessageResponse>(`${this.endpoint}${recipientId}`, { content }).pipe(
      tap(() => this._incrementSentToday()),
    );
  }

  /** Messages left before hitting today's client-side cap. */
  remainingToday(): number {
    return Math.max(0, DAILY_MESSAGE_LIMIT - this._sentToday());
  }

  getConversations(): Observable<ConversationsResponse> {
    return this.http.get<ConversationsResponse>(`${this.endpoint}conversations`).pipe(
      tap(res => this.conversations.set(res.data ?? [])),
    );
  }

  getThread(otherUserId: string, page = 1, limit = 30): Observable<ThreadResponse> {
    return this.http.get<ThreadResponse>(`${this.endpoint}${otherUserId}?page=${page}&limit=${limit}`);
  }

  /** Hides the conversation from the current user's own inbox/thread view
   *  only - the other participant's copy is untouched. */
  clearConversation(otherUserId: string): Observable<void> {
    return this.http.delete<void>(`${this.endpoint}${otherUserId}/clear`).pipe(
      tap(() => {
        this.conversations.set(this.conversations().filter(c => c.otherUser._id !== otherUserId));
      }),
    );
  }

  private _todayKey(): string {
    const d = new Date();
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  }

  private _sentToday(): number {
    if (!isPlatformBrowser(this.platformId)) return 0;
    const raw = localStorage.getItem(DAILY_COUNT_STORAGE_KEY);
    if (!raw) return 0;
    try {
      const parsed = JSON.parse(raw);
      return parsed.date === this._todayKey() ? (parsed.count ?? 0) : 0;
    } catch {
      return 0;
    }
  }

  private _incrementSentToday(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    localStorage.setItem(
      DAILY_COUNT_STORAGE_KEY,
      JSON.stringify({ date: this._todayKey(), count: this._sentToday() + 1 }),
    );
  }
}
