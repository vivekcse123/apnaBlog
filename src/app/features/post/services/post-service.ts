import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { apiResponse } from '../../../core/models/api-response.model';
import { HttpClient } from '@angular/common/http';
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

@Injectable({
  providedIn: 'root',
})
export class PostService {
  private endPoint = environment.apiPostEndpoint.replace(/\/+$/, '');
  private uplaodEndPoint = environment.apiUploadEndpoint;

  private http = inject(HttpClient);

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
    if (userId && userId.trim()) {
      body['userId'] = userId;
    }
    return this.http.post<apiResponse<Post>>(`${this.endPoint}/${postId}/comment`, body);
  }

  getComments(postId: string): Observable<{
    status: number;
    message: string;
    totalComments: number;
    comments: { name: string; comment: string; createdAt?: string }[];
  }> {
    return this.http.get<any>(`${this.endPoint}/${postId}/comments`);
  }

  deleteComment(postId: string, commentId: string): Observable<apiResponse<null>> {
    return this.http.delete<apiResponse<null>>(
      `${this.endPoint}/${postId}/comment/${commentId}`
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