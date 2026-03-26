import { inject, Injectable } from '@angular/core';
import { environment } from '../../../../environments/environment';
import { Observable } from 'rxjs';
import { apiResponse } from '../../../core/models/api-response.model';
import { HttpClient } from '@angular/common/http';
import { Post } from '../../../core/models/post.model';

type CreatePostPayload = Omit<
  Post,
  '_id' | 'user' | 'userId' | 'likesCount' | 'commentsCount' | 'views' | 'createdAt' | 'updatedAt'
>;

@Injectable({
  providedIn: 'root',
})
export class PostService {
  // Normalize endpoint — strip trailing slash so all URL builds are consistent:
  // e.g.  'http://localhost:3000/api/post/'  →  'http://localhost:3000/api/post'
  // Then every method appends  '/id/like'  correctly with no double-slash risk.
  private endPoint = environment.apiPostEndpoint.replace(/\/+$/, '');

  private http = inject(HttpClient);

  // ── CRUD ──────────────────────────────────────────────────────────────────

  createBlog(postData: CreatePostPayload): Observable<apiResponse<Post>> {
    return this.http.post<apiResponse<Post>>(`${this.endPoint}`, postData);
  }

  getAllPost(page: number = 1, limit: number = 10): Observable<apiResponse<Post[]>> {
    return this.http.get<apiResponse<Post[]>>(`${this.endPoint}?page=${page}&limit=${limit}`);
  }

  getPostById(id: string): Observable<apiResponse<Post>> {
    return this.http.get<apiResponse<Post>>(`${this.endPoint}/${id}`);
  }

  deletePost(id: string): Observable<apiResponse<null>> {
    return this.http.delete<apiResponse<null>>(`${this.endPoint}/${id}`);
  }

  updatePost(id: string, postData: Partial<CreatePostPayload>): Observable<apiResponse<Post>> {
    return this.http.patch<apiResponse<Post>>(`${this.endPoint}/${id}`, postData);
  }

  getPostByUserId(id: string, page: number = 1, limit: number = 10): Observable<apiResponse<Post[]>> {
    return this.http.get<apiResponse<Post[]>>(
      `${this.endPoint}/user/${id}?page=${page}&limit=${limit}`
    );
  }

  // ── INTERACTIONS ─────────────────────────────────────────────────────────

  /** POST /:id/like — increments likesCount */
  likePost(postId: string): Observable<apiResponse<Post>> {
    return this.http.post<apiResponse<Post>>(`${this.endPoint}/${postId}/like`, {});
  }

  /** POST /:id/view — increments views */
  addView(postId: string): Observable<apiResponse<Post>> {
    return this.http.post<apiResponse<Post>>(`${this.endPoint}/${postId}/view`, {});
  }

  /**
   * POST /:id/comment
   * Sends { comment, userId? } — userId is omitted for anonymous/guest users.
   * Backend sets name to 'Anonymous' when userId is absent.
   */
  commentPost(
    postId: string,
    comment: string,
    userId?: string
  ): Observable<apiResponse<Post>> {
    // Only include userId in the payload when a real logged-in user ID is
    // present. If omitted, the backend sets name = 'Anonymous' automatically.
    const body: Record<string, string> = { comment: comment.trim() };
    if (userId && userId.trim()) {
      body['userId'] = userId;
    }
    return this.http.post<apiResponse<Post>>(`${this.endPoint}/${postId}/comment`, body);
  }

  /**
   * GET /:id/comments
   * Returns { comments: [], totalComments: number }
   */
  getComments(postId: string): Observable<{
    status: number;
    message: string;
    totalComments: number;
    comments: { name: string; comment: string; createdAt?: string }[];
  }> {
    return this.http.get<any>(`${this.endPoint}/${postId}/comments`);
  }
}