import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { VideoShort, ShortComment } from '../models/video-short.model';
import { environment } from '../../../../environments/environment';

export interface ShortsPage {
  status: number;
  data: VideoShort[];
  total: number;
  page: number;
  totalPages: number;
  publishedCount?: number;
  pendingCount?: number;
}

export interface CreateShortPayload {
  title:        string;
  caption?:     string;
  category:     string;
  videoType:    'upload' | 'youtube';
  videoUrl:     string;
  youtubeId?:   string;
  thumbnailUrl?: string;
  duration?:    number;
  linkedPostSlug?:        string;
  isSponsored?:           boolean;
  sponsoredDays?:         number;
  sponsoredExpiryAction?: 'delete' | 'keep';
}

@Injectable({ providedIn: 'root' })
export class ShortsService {
  private http     = inject(HttpClient);
  private endpoint = environment.apiShortsEndpoint.replace(/\/+$/, '');

  getShortsByUser(userId: string, page = 1, limit = 12): Observable<ShortsPage> {
    return this.http.get<ShortsPage>(
      `${this.endpoint}/user/${userId}?page=${page}&limit=${limit}`
    ).pipe(catchError(() => of({ status: 200, data: [], total: 0, page: 1, totalPages: 1 })));
  }

  getMyShorts(page = 1, limit = 20, status?: 'published' | 'pending'): Observable<ShortsPage> {
    let url = `${this.endpoint}/my?page=${page}&limit=${limit}`;
    if (status) url += `&status=${status}`;
    return this.http.get<ShortsPage>(url).pipe(
      catchError(() => of({ status: 200, data: [], total: 0, page: 1, totalPages: 1 }))
    );
  }

  getSponsoredShorts(): Observable<{ status: number; data: VideoShort[] }> {
    return this.http.get<{ status: number; data: VideoShort[] }>(`${this.endpoint}/sponsored`).pipe(
      catchError(() => of({ status: 200, data: [] }))
    );
  }

  // ── FIXED: always pass status=published so backend only returns published shorts ──
  getShorts(page = 1, limit = 8, category?: string, search?: string): Observable<ShortsPage> {
    let url = `${this.endpoint}?page=${page}&limit=${limit}&status=published`;
    if (category && category !== 'All') url += `&category=${encodeURIComponent(category)}`;
    if (search?.trim()) url += `&search=${encodeURIComponent(search.trim())}`;
    return this.http.get<ShortsPage>(url).pipe(
      catchError(() => of({ status: 200, data: [], total: 0, page: 1, totalPages: 1 }))
    );
  }

  createShort(data: CreateShortPayload): Observable<{ status: number; data: VideoShort }> {
    return this.http.post<{ status: number; data: VideoShort }>(this.endpoint, data);
  }

  getLikes(id: string, page = 1, limit = 20): Observable<{ status: number; data: { _id: string; name: string; avatar?: string }[]; total: number; totalPages: number }> {
    return this.http.get<any>(`${this.endpoint}/${id}/likes?page=${page}&limit=${limit}`).pipe(
      catchError(() => of({ status: 200, data: [], total: 0, totalPages: 0 }))
    );
  }

  likeShort(id: string): Observable<{ status: number }> {
    return this.http.post<{ status: number }>(`${this.endpoint}/${id}/like`, {});
  }

  unlikeShort(id: string): Observable<{ status: number }> {
    return this.http.delete<{ status: number }>(`${this.endpoint}/${id}/like`);
  }

  addComment(id: string, comment: string, userId?: string): Observable<{ status: number; data: { comment: ShortComment; commentsCount: number } }> {
    const body: Record<string, string> = { comment };
    if (userId) body['userId'] = userId;
    return this.http.post<any>(`${this.endpoint}/${id}/comment`, body).pipe(
      catchError(() => {
        const mockComment: ShortComment = {
          _id:       `c_${Date.now()}`,
          comment,
          name:      'You',
          createdAt: new Date(),
        };
        return of({ status: 200, data: { comment: mockComment, commentsCount: 1 } });
      })
    );
  }

  deleteComment(shortId: string, commentId: string): Observable<{ status: number }> {
    return this.http.delete<{ status: number }>(`${this.endpoint}/${shortId}/comments/${commentId}`);
  }

  deleteReply(shortId: string, commentId: string, replyId: string): Observable<{ status: number }> {
    return this.http.delete<{ status: number }>(`${this.endpoint}/${shortId}/comments/${commentId}/replies/${replyId}`);
  }

  addReply(shortId: string, commentId: string, reply: string): Observable<{ status: number; data: { reply: any } }> {
    return this.http.post<any>(
      `${this.endpoint}/${shortId}/comments/${commentId}/reply`,
      { comment: reply }
    ).pipe(
      catchError(() => of({
        status: 201,
        data: { reply: { _id: `r_${Date.now()}`, comment: reply, name: 'You', createdAt: new Date() } },
      }))
    );
  }

  getShortById(id: string): Observable<{ status: number; data: VideoShort }> {
    return this.http.get<{ status: number; data: VideoShort }>(`${this.endpoint}/${id}`);
  }

  addView(id: string): Observable<{ status: number }> {
    return this.http.post<{ status: number }>(`${this.endpoint}/${id}/view`, {}).pipe(
      catchError(() => of({ status: 200 }))
    );
  }

  getComments(id: string): Observable<{ status: number; data: ShortComment[] }> {
    return this.http.get<any>(`${this.endpoint}/${id}/comments`).pipe(
      catchError(() => of({ status: 200, data: [] }))
    );
  }

  // ── Admin-only endpoints ─────────────────────────────────────────────────────

  getAllShortsAdmin(params: {
    page?: number; limit?: number;
    category?: string; status?: string;
    type?: string; search?: string; isSponsored?: boolean;
  } = {}): Observable<ShortsPage> {
    const p = new URLSearchParams();
    if (params.page)        p.set('page',        String(params.page));
    if (params.limit)       p.set('limit',       String(params.limit));
    if (params.category)    p.set('category',    params.category);
    if (params.status)      p.set('status',      params.status);
    if (params.type)        p.set('type',        params.type);
    if (params.search)      p.set('search',      params.search);
    if (params.isSponsored) p.set('isSponsored', 'true');
    return this.http.get<ShortsPage>(`${this.endpoint}/admin/all?${p.toString()}`).pipe(
      catchError(() => of({ status: 200, data: [], total: 0, page: 1, totalPages: 1 }))
    );
  }

  updateShort(id: string, data: { title: string; caption?: string; category: string; linkedPostSlug?: string }): Observable<{ status: number; data: VideoShort }> {
    return this.http.patch<{ status: number; data: VideoShort }>(`${this.endpoint}/${id}`, data);
  }

  updateStatus(id: string, status: 'published' | 'pending'): Observable<{ status: number; data: VideoShort }> {
    return this.http.patch<{ status: number; data: VideoShort }>(
      `${this.endpoint}/${id}/status`, { status }
    );
  }

  deleteShort(id: string): Observable<{ status: number; message: string }> {
    return this.http.delete<{ status: number; message: string }>(`${this.endpoint}/${id}`);
  }

  sponsorShort(id: string, days?: number, expiryAction?: 'delete' | 'keep', priority = 10, ctaText?: string, ctaUrl?: string): Observable<{ status: number; data: VideoShort }> {
    const sponsoredUntil = days
      ? new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString()
      : null;
    return this.http.patch<{ status: number; data: VideoShort }>(`${this.endpoint}/${id}/sponsor`, {
      isSponsored:           true,
      sponsoredUntil,
      sponsoredExpiryAction: expiryAction ?? null,
      sponsorPriority:       priority,
      sponsorCtaText:        ctaText ?? null,
      sponsorCtaUrl:         ctaUrl  ?? null,
    });
  }

  unsponsorShort(id: string): Observable<{ status: number; data: VideoShort }> {
    return this.http.patch<{ status: number; data: VideoShort }>(`${this.endpoint}/${id}/sponsor`, {
      isSponsored:           false,
      sponsoredUntil:        null,
      sponsoredExpiryAction: null,
      sponsorPriority:       10,
      sponsorCtaText:        null,
      sponsorCtaUrl:         null,
    });
  }

  /** Extract YouTube video ID from any YouTube URL format. */
  extractYouTubeId(url: string): string | null {
    const patterns = [
      /youtu\.be\/([^?&#/]+)/,
      /youtube\.com\/watch\?v=([^&#]+)/,
      /youtube\.com\/shorts\/([^?&#/]+)/,
      /youtube\.com\/embed\/([^?&#/]+)/,
    ];
    for (const re of patterns) {
      const m = url.match(re);
      if (m?.[1]) return m[1];
    }
    return null;
  }

  youtubeThumbnail(youtubeId: string): string {
    return `https://img.youtube.com/vi/${youtubeId}/mqdefault.jpg`;
  }

  /** Fetch and cache the actual duration of a YouTube short from the server. */
  fetchYtDuration(shortId: string): Observable<number | null> {
    return this.http.get<{ status: number; duration: number | null }>(
      `${this.endpoint}/${shortId}/duration`
    ).pipe(
      map(r => r.duration ?? null),
      catchError(() => of(null))
    );
  }
}