import { inject, Injectable } from '@angular/core';
import { environment } from '../../../../environments/environment';
import { Observable, tap } from 'rxjs';
import { apiResponse } from '../../../core/models/api-response.model';
import { HttpClient } from '@angular/common/http';
import { Post } from '../../../core/models/post.model';

type CreatePostPayload = Omit<Post, '_id' | 'user' | 'userId' | 'likesCount' | 'commentsCount' | 'views' | 'createdAt' | 'updatedAt'>;

@Injectable({
  providedIn: 'root',
})
export class PostService {
  private endPoint = environment.apiPostEndpoint;
  private http = inject(HttpClient);

  createBlog(postData: CreatePostPayload): Observable<apiResponse<Post>> {
    return this.http.post<apiResponse<Post>>(`${this.endPoint}`, postData);
  }

  getAllPost(page: number = 1, limit: number = 5): Observable<apiResponse<Post[]>> {
    return this.http.get<apiResponse<Post[]>>(`${this.endPoint}?page=${page}&limit=${limit}`);
  }

  getPostById(id: string): Observable<apiResponse<Post>> {
    return this.http.get<apiResponse<Post>>(`${this.endPoint}${id}`);
  }

  deletePost(id: string): Observable<apiResponse<null>> {
    return this.http.delete<apiResponse<null>>(`${this.endPoint}${id}`);
  }

  updatePost(id: string, postData: Partial<CreatePostPayload>): Observable<apiResponse<Post>> {
    return this.http.patch<apiResponse<Post>>(`${this.endPoint}${id}`, postData);
  }

}