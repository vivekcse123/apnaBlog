import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { VideoShort, ShortComment } from '../models/video-short.model';
import { environment } from '../../../../environments/environment';

export interface ShortsPage {
  status: number;
  data: VideoShort[];
  total: number;
  page: number;
  totalPages: number;
}

export interface CreateShortPayload {
  title: string;
  caption?: string;
  category: string;
  videoType: 'upload' | 'youtube';
  videoUrl: string;
  youtubeId?: string;
  thumbnailUrl?: string;
  duration?: number;
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

  getShorts(page = 1, limit = 8, category?: string): Observable<ShortsPage> {
    let url = `${this.endpoint}?page=${page}&limit=${limit}`;
    if (category && category !== 'All') url += `&category=${encodeURIComponent(category)}`;
    return this.http.get<ShortsPage>(url).pipe(
      catchError(() => of({ status: 200, data: [], total: 0, page: 1, totalPages: 1 }))
    );
  }

  createShort(data: CreateShortPayload): Observable<{ status: number; data: VideoShort }> {
    return this.http.post<{ status: number; data: VideoShort }>(this.endpoint, data).pipe(
      catchError(() => {
        // Backend endpoint not yet implemented — return a local mock so the UI flow
        // can be fully tested before the API is ready.
        const mock: VideoShort = {
          _id:          `local_${Date.now()}`,
          title:        data.title,
          caption:      data.caption,
          category:     data.category,
          videoType:    data.videoType,
          videoUrl:     data.videoUrl,
          youtubeId:    data.youtubeId,
          thumbnailUrl: data.thumbnailUrl,
          likesCount:   0,
          commentsCount: 0,
          views:        0,
          comments:     [],
          user:         { _id: 'local', name: 'You' },
          createdAt:    new Date(),
          status:       'published',
        };
        return of({ status: 200, data: mock });
      })
    );
  }

  likeShort(id: string): Observable<{ status: number }> {
    return this.http.post<{ status: number }>(`${this.endpoint}/${id}/like`, {}).pipe(
      catchError(() => of({ status: 200 }))
    );
  }

  unlikeShort(id: string): Observable<{ status: number }> {
    return this.http.delete<{ status: number }>(`${this.endpoint}/${id}/like`).pipe(
      catchError(() => of({ status: 200 }))
    );
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
    type?: string; search?: string;
  } = {}): Observable<ShortsPage> {
    const p = new URLSearchParams();
    if (params.page)     p.set('page',     String(params.page));
    if (params.limit)    p.set('limit',    String(params.limit));
    if (params.category) p.set('category', params.category);
    if (params.status)   p.set('status',   params.status);
    if (params.type)     p.set('type',     params.type);
    if (params.search)   p.set('search',   params.search);
    return this.http.get<ShortsPage>(`${this.endpoint}/admin/all?${p.toString()}`).pipe(
      catchError(() => of({ status: 200, data: [], total: 0, page: 1, totalPages: 1 }))
    );
  }

  updateStatus(id: string, status: 'published' | 'pending'): Observable<{ status: number; data: VideoShort }> {
    return this.http.patch<{ status: number; data: VideoShort }>(
      `${this.endpoint}/${id}/status`, { status }
    );
  }

  deleteShort(id: string): Observable<{ status: number; message: string }> {
    return this.http.delete<{ status: number; message: string }>(`${this.endpoint}/${id}`);
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
}
