import { Injectable, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { io, Socket } from 'socket.io-client';
import { environment } from '../../../../environments/environment';
import { Auth } from '../../../core/services/auth';
import { CallbackRequestRecord, CallbackStatus, CreateCallbackRequestPayload, SubmitFeedbackPayload } from '../models/callback-request.model';

interface ListResponse { status: number; data: CallbackRequestRecord[]; total?: number; page?: number; }
interface ItemResponse { status: number; message: string; data: CallbackRequestRecord; }
export interface ExpertRating { expertSlug: string; avgRating: number; count: number; }
interface RatingsResponse { status: number; data: ExpertRating[]; }
export interface ExpertReview { userName: string; rating: number; comment: string; submittedAt: string; }
interface ReviewsResponse { status: number; data: ExpertReview[]; }
export interface ExpertSessionCount { expertSlug: string; count: number; }
interface SessionCountsResponse { status: number; data: ExpertSessionCount[]; }

export interface AdminCallbackFilters {
  status?: CallbackStatus;
  expertSlug?: string;
  category?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

// Real backend calls (no more local-only simulation) + a live Socket.IO
// listener so the user/admin dashboards update the moment a callback
// request is created or its status changes, instead of needing a manual
// refresh. See blogApp/src/socket.js for the server side of this.
@Injectable({ providedIn: 'root' })
export class CallbackRequestService {
  private http = inject(HttpClient);
  private auth = inject(Auth);
  private platformId = inject(PLATFORM_ID);

  private socket: Socket | null = null;
  /** Bumped on every 'callback_created'/'callback_updated' event - components can
   *  react to this signal (e.g. in an effect) to know when to refetch. */
  liveTick = signal(0);

  private headers(): HttpHeaders | undefined {
    const token = this.auth.getToken();
    return token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : undefined;
  }

  private connectSocket(): void {
    if (!isPlatformBrowser(this.platformId) || this.socket) return;
    const base = environment.apiUrl.replace(/\/api\/?$/, '');
    this.socket = io(base, { auth: { token: this.auth.getToken() ?? '' }, transports: ['websocket', 'polling'] });
    this.socket.on('callback_created', () => this.liveTick.update(v => v + 1));
    this.socket.on('callback_updated', () => this.liveTick.update(v => v + 1));
  }

  /** Call once from a page that displays live callback-request data. */
  ensureLive(): void {
    this.connectSocket();
  }

  /** Public aggregate rating per expert (from real submitted feedback only). */
  ratings(): Observable<RatingsResponse> {
    return this.http.get<RatingsResponse>(`${environment.apiUrl}/callback-requests/ratings`);
  }

  /** Public list of real submitted reviews for one expert's profile page. */
  reviewsFor(expertSlug: string): Observable<ReviewsResponse> {
    return this.http.get<ReviewsResponse>(`${environment.apiUrl}/callback-requests/reviews/${expertSlug}`);
  }

  /** Public real "Sessions Guided" count (completed requests) for one expert. */
  statsFor(expertSlug: string): Observable<{ status: number; data: { completedSessions: number } }> {
    return this.http.get<{ status: number; data: { completedSessions: number } }>(`${environment.apiUrl}/callback-requests/stats/${expertSlug}`);
  }

  /** Public real "Sessions Guided" count per expert, in bulk (for marketplace cards). */
  sessionCounts(): Observable<SessionCountsResponse> {
    return this.http.get<SessionCountsResponse>(`${environment.apiUrl}/callback-requests/session-counts`);
  }

  create(payload: CreateCallbackRequestPayload): Observable<ItemResponse> {
    const h = this.headers();
    return this.http.post<ItemResponse>(`${environment.apiUrl}/callback-requests`, payload, h ? { headers: h } : {});
  }

  mine(): Observable<ListResponse> {
    const h = this.headers();
    return this.http.get<ListResponse>(`${environment.apiUrl}/callback-requests/mine`, h ? { headers: h } : {});
  }

  /** The logged-in mentor's own assigned requests (403s if not a mentor). */
  forMentor(status?: CallbackStatus): Observable<ListResponse> {
    const h = this.headers();
    let params = new HttpParams();
    if (status) params = params.set('status', status);
    return this.http.get<ListResponse>(`${environment.apiUrl}/callback-requests/for-mentor`, { headers: h, params });
  }

  cancel(id: string): Observable<ItemResponse> {
    const h = this.headers();
    return this.http.patch<ItemResponse>(`${environment.apiUrl}/callback-requests/${id}/cancel`, {}, h ? { headers: h } : {});
  }

  /** Requester rates a completed session (once). */
  submitFeedback(id: string, payload: SubmitFeedbackPayload): Observable<ItemResponse> {
    const h = this.headers();
    return this.http.post<ItemResponse>(`${environment.apiUrl}/callback-requests/${id}/feedback`, payload, h ? { headers: h } : {});
  }

  adminList(filters: AdminCallbackFilters = {}): Observable<ListResponse> {
    const h = this.headers();
    let params = new HttpParams();
    for (const [key, value] of Object.entries(filters)) {
      if (value !== undefined && value !== null && value !== '') params = params.set(key, String(value));
    }
    return this.http.get<ListResponse>(`${environment.apiUrl}/callback-requests`, { headers: h, params });
  }

  updateStatus(id: string, status: CallbackStatus, note = '', scheduledAt?: string): Observable<ItemResponse> {
    const h = this.headers();
    return this.http.patch<ItemResponse>(
      `${environment.apiUrl}/callback-requests/${id}/status`,
      { status, note, scheduledAt },
      h ? { headers: h } : {}
    );
  }
}
