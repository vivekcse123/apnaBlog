import { inject, Injectable, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Observable, of, shareReplay, finalize, tap, forkJoin } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';
import { apiResponse } from '../../../core/models/api-response.model';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Post } from '../../../core/models/post.model';
import { environment } from '../../../../environments/environment';

type CreatePostPayload = Omit<
  Post,
  '_id' | 'user' | 'userId' | 'likesCount' | 'commentsCount' | 'views' | 'createdAt' | 'updatedAt'
>;

export interface CommentReply {
  _id?:       string;
  name:       string;
  comment:    string;
  user?:      string | null;
  createdAt?: string;
}

export interface CommentsResponse {
  status:        number;
  message:       string;
  totalComments: number;
  comments:      Array<{
    _id?:       string;
    name:       string;
    comment:    string;
    user?:      string | null;
    createdAt?: string;
    replies?:   CommentReply[];
  }>;
}

@Injectable({ providedIn: 'root' })
export class PostService {
  private endPoint   = environment.apiPostEndpoint.replace(/\/+$/, '');
  private http       = inject(HttpClient);
  private platformId = inject(PLATFORM_ID);

  // ── Liked-post-ID persistence (shared by blog-detail and home feed cards) ──
  // Single localStorage-backed set, keyed globally (not per logged-in user) -
  // matches the pre-existing behavior this centralizes, unchanged.
  private readonly LIKED_IDS_KEY = 'apna_liked_posts';

  getLikedIds(): Set<string> {
    if (!isPlatformBrowser(this.platformId)) return new Set();
    try {
      const s = localStorage.getItem(this.LIKED_IDS_KEY);
      return s ? new Set(JSON.parse(s)) : new Set();
    } catch { return new Set(); }
  }

  saveLikedIds(ids: Set<string>): void {
    if (!isPlatformBrowser(this.platformId)) return;
    try { localStorage.setItem(this.LIKED_IDS_KEY, JSON.stringify([...ids])); } catch { }
  }

  /** Toggles one post ID in the liked-set, persists it, and returns the new liked state. */
  toggleLikedId(postId: string): boolean {
    const ids = this.getLikedIds();
    const nowLiked = !ids.has(postId);
    if (nowLiked) ids.add(postId); else ids.delete(postId);
    this.saveLikedIds(ids);
    return nowLiked;
  }

  // In-flight request deduplication - concurrent callers share one HTTP request
  private readonly _inflight = new Map<string, Observable<any>>();

  // Per-post TTL cache - makes every ViewPost re-open instant
  private readonly _postCache = new Map<string, { res: apiResponse<Post>; ts: number }>();
  private readonly POST_TTL   = 5 * 60 * 1_000; // 5 min

  private dedupe<T>(key: string, create: () => Observable<T>): Observable<T> {
    if (!this._inflight.has(key)) {
      this._inflight.set(
        key,
        create().pipe(
          shareReplay(1),
          finalize(() => this._inflight.delete(key))
        )
      );
    }
    return this._inflight.get(key)!;
  }

  /** Drop the cached entry for one post (call after any mutation). */
  invalidatePost(id: string): void {
    this._postCache.delete(id);
    this._inflight.delete(`post_${id}`);
  }

  // ── Read (deduped) ─────────────────────────────────────────────────────────

  getAllPost(page = 1, limit = 10): Observable<apiResponse<Post[]>> {
    return this.dedupe(`all_${page}_${limit}`,
      () => this.http.get<apiResponse<Post[]>>(`${this.endPoint}?page=${page}&limit=${limit}`)
    );
  }

  /** Single page fetch - caller paginates through all pages. */
  getStatsPage(page: number): Observable<apiResponse<Post[]>> {
    return this.http.get<apiResponse<Post[]>>(`${this.endPoint}?page=${page}&limit=100`);
  }

  /**
   * Fetches ALL published posts by paginating through every server page.
   * Page 1 reveals totalPages, then pages 2..N are fetched in parallel
   * (not sequentially) - this matters most for Prerender routes (/blog,
   * /category/*) where `ng serve` live-renders the whole page, crawl
   * included, on every reload (unlike production's build-time prerender).
   */
  getAllPublished(): Observable<Post[]> {
    return this.getStatsPage(1).pipe(
      switchMap(first => {
        const total = first.totalPages ?? 1;
        if (total <= 1) return of(first.data ?? []);

        const rest = Array.from({ length: total - 1 }, (_, i) => this.getStatsPage(i + 2));
        return forkJoin(rest).pipe(
          map(pages => (first.data ?? []).concat(...pages.map(p => p.data ?? []))),
        );
      }),
    );
  }

  getAllPostAdmin(page = 1, limit = 10): Observable<apiResponse<Post[]>> {
    return this.dedupe(`admin_${page}_${limit}`,
      () => this.http.get<apiResponse<Post[]>>(`${this.endPoint}?page=${page}&limit=${limit}&status=all`)
    );
  }

  getPostById(id: string): Observable<apiResponse<Post>> {
    // Serve from TTL cache - makes repeated ViewPost opens instant
    const hit = this._postCache.get(id);
    if (hit && Date.now() - hit.ts < this.POST_TTL) return of(hit.res);

    return this.dedupe(`post_${id}`,
      () => this.http.get<apiResponse<Post>>(`${this.endPoint}/${id}`).pipe(
        tap(res => this._postCache.set(id, { res, ts: Date.now() }))
      )
    );
  }

  getPostByUserId(id: string, page = 1, limit = 10): Observable<apiResponse<Post[]>> {
    return this.dedupe(`user_${id}_${page}_${limit}`,
      () => this.http.get<apiResponse<Post[]>>(`${this.endPoint}/user/${id}?page=${page}&limit=${limit}`)
    );
  }

  getRelatedPosts(id: string): Observable<apiResponse<Post[]>> {
    return this.http.get<apiResponse<Post[]>>(`${this.endPoint}/${id}/related`);
  }

  getComments(postId: string, skip = 0, limit = 10): Observable<CommentsResponse> {
    const params = new HttpParams().set('skip', skip).set('limit', limit);
    return this.dedupe(`comments_${postId}_${skip}_${limit}`,
      () => this.http.get<CommentsResponse>(`${this.endPoint}/${postId}/comments`, { params })
    );
  }

  // ── Write (never deduped - each is a distinct mutation) ───────────────────

  createBlog(postData: CreatePostPayload): Observable<apiResponse<Post>> {
    return this.http.post<apiResponse<Post>>(`${this.endPoint}`, postData);
  }

  deletePost(id: string): Observable<apiResponse<null>> {
    return this.http.delete<apiResponse<null>>(`${this.endPoint}/${id}`);
  }

  updatePost(id: string, postData: Partial<CreatePostPayload>): Observable<apiResponse<Post>> {
    this.invalidatePost(id);
    return this.http.patch<apiResponse<Post>>(`${this.endPoint}/${id}`, postData).pipe(
      tap(res => { if (res.data) this._postCache.set(id, { res, ts: Date.now() }); })
    );
  }

  resubmitPost(id: string): Observable<apiResponse<Post>> {
    this.invalidatePost(id);
    return this.http.post<apiResponse<Post>>(`${this.endPoint}/${id}/resubmit`, {});
  }

  requestPostDelete(id: string, reason: string): Observable<apiResponse<Post>> {
    return this.http.post<apiResponse<Post>>(`${this.endPoint}/${id}/request-delete`, { reason });
  }

  cancelPostDeleteRequest(id: string): Observable<apiResponse<Post>> {
    return this.http.delete<apiResponse<Post>>(`${this.endPoint}/${id}/cancel-delete-request`);
  }

  approveDeleteRequest(id: string): Observable<apiResponse<null>> {
    return this.http.patch<apiResponse<null>>(`${this.endPoint}/${id}/approve-delete-request`, {});
  }

  rejectDeleteRequest(id: string): Observable<apiResponse<Post>> {
    return this.http.patch<apiResponse<Post>>(`${this.endPoint}/${id}/reject-delete-request`, {});
  }

  reassignAuthor(postId: string, userId: string): Observable<apiResponse<Post>> {
    this.invalidatePost(postId);
    return this.http.patch<apiResponse<Post>>(`${this.endPoint}/${postId}/reassign-author`, { userId });
  }

  likePost(postId: string): Observable<apiResponse<Post>> {
    return this.http.post<apiResponse<Post>>(`${this.endPoint}/${postId}/like`, {});
  }

  unlikePost(postId: string): Observable<apiResponse<Post>> {
    return this.http.delete<apiResponse<Post>>(`${this.endPoint}/${postId}/like`);
  }

  getPostReactions(postId: string): Observable<{ status: number; data: { counts: Record<string, number>; myEmoji: string | null } }> {
    return this.http.get<any>(`${this.endPoint}/${postId}/post-reactions`);
  }

  postReact(postId: string, emoji: string | null): Observable<{ status: number; message: string }> {
    return this.http.post<any>(`${this.endPoint}/${postId}/post-react`, { emoji });
  }

  addView(postId: string): Observable<apiResponse<Post>> {
    return this.http.post<apiResponse<Post>>(`${this.endPoint}/${postId}/view`, {});
  }

  translatePost(id: string, lang: string): Observable<{ status: number; lang: string; data: { title: string; description: string; content: string; translatedAt: string } }> {
    return this.http.get<any>(`${this.endPoint}/${id}/translate?lang=${lang}`);
  }

  commentPost(postId: string, comment: string, userId?: string): Observable<apiResponse<Post>> {
    const body: Record<string, string> = { comment: comment.trim() };
    if (userId?.trim()) body['userId'] = userId;
    return this.http.post<apiResponse<Post>>(`${this.endPoint}/${postId}/comment`, body);
  }

  deleteComment(postId: string, commentId: string): Observable<apiResponse<null>> {
    return this.http.delete<apiResponse<null>>(`${this.endPoint}/${postId}/comment/${commentId}`);
  }

  addReply(
    postId: string, commentId: string, comment: string, userId?: string
  ): Observable<{ status: number; message: string; data: { reply: CommentReply; commentId: string } }> {
    const body: Record<string, string> = { comment: comment.trim() };
    if (userId?.trim()) body['userId'] = userId;
    return this.http.post<{ status: number; message: string; data: { reply: CommentReply; commentId: string } }>(
      `${this.endPoint}/${postId}/comment/${commentId}/reply`, body
    );
  }

  deleteReply(postId: string, commentId: string, replyId: string): Observable<apiResponse<null>> {
    return this.http.delete<apiResponse<null>>(
      `${this.endPoint}/${postId}/comment/${commentId}/reply/${replyId}`
    );
  }

  // ── Sponsorship ───────────────────────────────────────────────────────────

  getSponsoredPosts(): Observable<apiResponse<Post[]>> {
    return this.http.get<apiResponse<Post[]>>(`${this.endPoint}/sponsored`);
  }

  getSponsoredBlogsReport(): Observable<{ status: number; data: any[]; stats: any }> {
    return this.http.get<any>(`${this.endPoint}/admin/sponsored-report`);
  }

  sponsorPost(id: string, days?: number, expiryAction?: 'delete' | 'keep', priority = 10, ctaText?: string, ctaUrl?: string): Observable<apiResponse<Post>> {
    const sponsoredUntil = days
      ? new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString()
      : null;
    return this.updatePost(id, {
      isSponsored:           true,
      sponsoredUntil,
      sponsoredExpiryAction: expiryAction ?? null,
      sponsorPriority:       priority,
      sponsorCtaText:        ctaText ?? null,
      sponsorCtaUrl:         ctaUrl  ?? null,
    });
  }

  unsponsorPost(id: string): Observable<apiResponse<Post>> {
    return this.updatePost(id, {
      isSponsored:           false,
      sponsoredUntil:        null,
      sponsoredExpiryAction: null,
      sponsorPriority:       10,
      sponsorCtaText:        null,
      sponsorCtaUrl:         null,
    });
  }

  // ── Paragraph reactions ────────────────────────────────────────────────────

  getReactions(postId: string): Observable<{
    status: number;
    data: Record<number, Record<string, number>>;
    myReactions: Record<number, string>;
  }> {
    return this.http.get<any>(`${this.endPoint}/${postId}/reactions`);
  }

  addReaction(postId: string, paragraphIdx: number, emoji: string): Observable<{ status: number; message: string }> {
    return this.http.post<any>(`${this.endPoint}/${postId}/react`, { paragraphIdx, emoji });
  }

  getSeriesPosts(authorId: string, seriesName: string): Observable<{ status: number; data: Pick<Post, '_id' | 'title' | 'slug' | 'seriesOrder' | 'seriesName' | 'createdAt'>[] }> {
    const params = new HttpParams().set('authorId', authorId).set('name', seriesName);
    return this.http.get<any>(`${this.endPoint}/series`, { params });
  }

  explainText(text: string, title?: string): Observable<{ status: number; data: { explanation: string } }> {
    return this.http.post<any>(`${environment.apiUrl}/ai/explain`, { text, title });
  }

}
