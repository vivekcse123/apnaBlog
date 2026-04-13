import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { apiResponse } from '../../../core/models/api-response.model';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Post } from '../../../core/models/post.model';
import { environment } from '../../../../environments/environments.prod';

type CreatePostPayload = Omit<
  Post,
  '_id' | 'user' | 'userId' | 'likesCount' | 'commentsCount' | 'views' | 'createdAt' | 'updatedAt'
>;

export interface UploadResponse {
  success:  boolean;
  message:  string;
  url:      string;
  publicId: string;
}

// ── Reply shape ───────────────────────────────────────────────────────────────
export interface CommentReply {
  _id?:       string;
  name:       string;
  comment:    string;
  user?:      string | null;
  createdAt?: string;
}

// ── Strongly-typed shape the backend actually returns for comments ─────────────
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

@Injectable({
  providedIn: 'root',
})
export class PostService {
  private endPoint       = environment.apiPostEndpoint.replace(/\/+$/, '');
  private uplaodEndPoint = environment.apiUploadEndpoint.replace(/\/+$/, '');

  private http = inject(HttpClient);

  createBlog(postData: CreatePostPayload): Observable<apiResponse<Post>> {
    return this.http.post<apiResponse<Post>>(`${this.endPoint}`, postData);
  }

  /**
   * PUBLIC home-page list — NO status param so the backend applies its own
   * default filter (published + draft).  draft = old posts that pre-date the
   * pending-approval workflow and must remain publicly visible.
   *
   * ✅ Fix for Bug 2: removed `status=all` which was leaking an admin-only
   *    parameter into the public request.
   */
  getAllPost(page: number = 1, limit: number = 10): Observable<apiResponse<Post[]>> {
    return this.http.get<apiResponse<Post[]>>(
      `${this.endPoint}?page=${page}&limit=${limit}`
    );
  }

  /**
   * ADMIN-ONLY list — passes status=all so the backend returns every post
   * (pending / draft / published).  Use this only from admin-guarded routes.
   */
  getAllPostAdmin(page: number = 1, limit: number = 10): Observable<apiResponse<Post[]>> {
    return this.http.get<apiResponse<Post[]>>(
      `${this.endPoint}?page=${page}&limit=${limit}&status=all`
    );
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

  likePost(postId: string): Observable<apiResponse<Post>> {
    return this.http.post<apiResponse<Post>>(`${this.endPoint}/${postId}/like`, {});
  }

  addView(postId: string): Observable<apiResponse<Post>> {
    return this.http.post<apiResponse<Post>>(`${this.endPoint}/${postId}/view`, {});
  }

  commentPost(
    postId: string,
    comment: string,
    userId?: string
  ): Observable<apiResponse<Post>> {
    const body: Record<string, string> = { comment: comment.trim() };
    if (userId?.trim()) {
      body['userId'] = userId;
    }
    return this.http.post<apiResponse<Post>>(`${this.endPoint}/${postId}/comment`, body);
  }

  /**
   * ✅ Fix for Bug 3: return type now uses `totalComments` (the actual field
   *    the backend sends) instead of the non-existent `total` / `totalCount`.
   */
  getComments(
    postId: string,
    skip:   number = 0,
    limit:  number = 10
  ): Observable<CommentsResponse> {
    const params = new HttpParams()
      .set('skip',  skip.toString())
      .set('limit', limit.toString());

    return this.http.get<CommentsResponse>(`${this.endPoint}/${postId}/comments`, { params });
  }

  deleteComment(postId: string, commentId: string): Observable<apiResponse<null>> {
    return this.http.delete<apiResponse<null>>(
      `${this.endPoint}/${postId}/comment/${commentId}`
    );
  }

  addReply(
    postId:    string,
    commentId: string,
    comment:   string,
    userId?:   string
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

  uploadImage(file: File): Observable<UploadResponse> {
    const formData = new FormData();
    formData.append('image', file);
    return this.http.post<UploadResponse>(`${this.uplaodEndPoint}`, formData);
  }

  deleteImage(publicId: string): Observable<{ success: boolean }> {
    return this.http.delete<{ success: boolean }>(
      `${this.uplaodEndPoint}/${encodeURIComponent(publicId)}`
    );
  }
}