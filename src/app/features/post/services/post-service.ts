import { inject, Injectable } from '@angular/core';
import { Observable, shareReplay, finalize } from 'rxjs';
import { apiResponse } from '../../../core/models/api-response.model';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Post } from '../../../core/models/post.model';
import { environment } from '../../../../environments/environments.prod';

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
  private endPoint = environment.apiPostEndpoint.replace(/\/+$/, '');
  private http     = inject(HttpClient);

  // In-flight request deduplication — concurrent callers share one HTTP request
  private readonly _inflight = new Map<string, Observable<any>>();

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

  // ── Read (deduped) ─────────────────────────────────────────────────────────

  getAllPost(page = 1, limit = 10): Observable<apiResponse<Post[]>> {
    return this.dedupe(`all_${page}_${limit}`,
      () => this.http.get<apiResponse<Post[]>>(`${this.endPoint}?page=${page}&limit=${limit}`)
    );
  }

  getAllPostAdmin(page = 1, limit = 10): Observable<apiResponse<Post[]>> {
    return this.dedupe(`admin_${page}_${limit}`,
      () => this.http.get<apiResponse<Post[]>>(`${this.endPoint}?page=${page}&limit=${limit}&status=all`)
    );
  }

  getPostById(id: string): Observable<apiResponse<Post>> {
    return this.dedupe(`post_${id}`,
      () => this.http.get<apiResponse<Post>>(`${this.endPoint}/${id}`)
    );
  }

  getPostByUserId(id: string, page = 1, limit = 10): Observable<apiResponse<Post[]>> {
    return this.dedupe(`user_${id}_${page}_${limit}`,
      () => this.http.get<apiResponse<Post[]>>(`${this.endPoint}/user/${id}?page=${page}&limit=${limit}`)
    );
  }

  getComments(postId: string, skip = 0, limit = 10): Observable<CommentsResponse> {
    const params = new HttpParams().set('skip', skip).set('limit', limit);
    return this.dedupe(`comments_${postId}_${skip}_${limit}`,
      () => this.http.get<CommentsResponse>(`${this.endPoint}/${postId}/comments`, { params })
    );
  }

  // ── Write (never deduped — each is a distinct mutation) ───────────────────

  createBlog(postData: CreatePostPayload): Observable<apiResponse<Post>> {
    return this.http.post<apiResponse<Post>>(`${this.endPoint}`, postData);
  }

  deletePost(id: string): Observable<apiResponse<null>> {
    return this.http.delete<apiResponse<null>>(`${this.endPoint}/${id}`);
  }

  updatePost(id: string, postData: Partial<CreatePostPayload>): Observable<apiResponse<Post>> {
    return this.http.patch<apiResponse<Post>>(`${this.endPoint}/${id}`, postData);
  }

  resubmitPost(id: string): Observable<apiResponse<Post>> {
    return this.http.post<apiResponse<Post>>(`${this.endPoint}/${id}/resubmit`, {});
  }

  requestPostDelete(id: string, reason: string): Observable<apiResponse<Post>> {
    return this.http.post<apiResponse<Post>>(`${this.endPoint}/${id}/request-delete`, { reason });
  }

  cancelPostDeleteRequest(id: string): Observable<apiResponse<Post>> {
    return this.http.delete<apiResponse<Post>>(`${this.endPoint}/${id}/cancel-delete-request`);
  }

  likePost(postId: string): Observable<apiResponse<Post>> {
    return this.http.post<apiResponse<Post>>(`${this.endPoint}/${postId}/like`, {});
  }

  unlikePost(postId: string): Observable<apiResponse<Post>> {
    return this.http.delete<apiResponse<Post>>(`${this.endPoint}/${postId}/like`);
  }

  addView(postId: string): Observable<apiResponse<Post>> {
    return this.http.post<apiResponse<Post>>(`${this.endPoint}/${postId}/view`, {});
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
}
