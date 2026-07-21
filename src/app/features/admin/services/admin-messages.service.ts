import { Injectable, inject, signal } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { SocketService } from '../../../core/services/socket.service';
import { Message } from '../../../shared/models/message.model';

export interface ContactMessage {
  _id:       string;
  name:      string;
  email:     string;
  subject:   string;
  message:   string;
  read:      boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AdminConversationUser {
  _id:    string;
  name:   string;
  email:  string;
  avatar: string | null;
}

export interface AdminConversation {
  userA:         AdminConversationUser;
  userB:         AdminConversationUser;
  lastMessage:   string;
  lastMessageAt: string;
  unreadCount:   number;
  messageCount:  number;
}

interface ContactListResponse {
  status: number; data: ContactMessage[]; total: number; page: number; pages: number; unreadCount: number;
}
interface ContactItemResponse { status: number; message: string; data: ContactMessage; }
interface ConversationListResponse { status: number; data: AdminConversation[]; total: number; page: number; pages: number; }
interface AdminThreadResponse {
  status: number; message: string; data: Message[];
  pagination: { total: number; page: number; limit: number; pages: number };
}

export interface ContactFilters { page?: number; limit?: number; read?: 'true' | 'false' | ''; search?: string; }
export interface ConversationFilters { page?: number; limit?: number; search?: string; }

// Aggregates the three inbound-message surfaces (Contact form, direct
// user-to-user Messages, and Callback/Booking requests - the latter embeds
// the existing ManageCallbackRequests component directly rather than being
// duplicated here, see manage-messages.ts) into one admin Messages module.
@Injectable({ providedIn: 'root' })
export class AdminMessagesService {
  private http = inject(HttpClient);
  private socketService = inject(SocketService);

  private liveSubscribed = false;
  /** Bumped on every 'contact_received'/'message_received' event - the
   *  manage-messages page reacts to this (e.g. in an effect) to refetch. */
  liveTick = signal(0);

  /** Unread counts for sidebar badges - populated from the most recent list
   *  fetch (no dedicated "counts only" endpoint), read by the dashboard
   *  shells to render the Messages nav-link badge. */
  unreadContactCount = signal(0);
  unreadMessageCount = signal(0);

  /** Call once from a page/service that displays live admin-messages data. */
  ensureLive(): void {
    if (this.liveSubscribed) return;
    this.liveSubscribed = true;
    this.socketService.on('contact_received').subscribe(() => this.liveTick.update(v => v + 1));
    this.socketService.on('message_received').subscribe(() => this.liveTick.update(v => v + 1));
  }

  listContacts(filters: ContactFilters = {}): Observable<ContactListResponse> {
    let params = new HttpParams();
    for (const [key, value] of Object.entries(filters)) {
      if (value !== undefined && value !== null && value !== '') params = params.set(key, String(value));
    }
    return this.http.get<ContactListResponse>(`${environment.apiUrl}/contact`, { params }).pipe(
      tap(res => this.unreadContactCount.set(res.unreadCount ?? 0)),
    );
  }

  markContactRead(id: string): Observable<ContactItemResponse> {
    return this.http.patch<ContactItemResponse>(`${environment.apiUrl}/contact/${id}/read`, {}).pipe(
      tap(() => this.unreadContactCount.update(n => Math.max(0, n - 1))),
    );
  }

  listConversations(filters: ConversationFilters = {}): Observable<ConversationListResponse> {
    let params = new HttpParams();
    for (const [key, value] of Object.entries(filters)) {
      if (value !== undefined && value !== null && value !== '') params = params.set(key, String(value));
    }
    return this.http.get<ConversationListResponse>(`${environment.apiMessagesEndpoint}admin/all`, { params }).pipe(
      tap(res => this.unreadMessageCount.set((res.data ?? []).reduce((sum, c) => sum + c.unreadCount, 0))),
    );
  }

  getAdminThread(userAId: string, userBId: string, page = 1, limit = 50): Observable<AdminThreadResponse> {
    const params = new HttpParams().set('page', page).set('limit', limit);
    return this.http.get<AdminThreadResponse>(`${environment.apiMessagesEndpoint}admin/thread/${userAId}/${userBId}`, { params });
  }
}
