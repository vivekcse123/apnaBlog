import { inject, Injectable } from '@angular/core';
import { environment } from '../../../../environments/environment';
import { Observable } from 'rxjs';
import { apiResponse } from '../../../core/models/api-response.model';
import { HttpClient } from '@angular/common/http';
import { Post } from '../../../core/models/post.mode';

@Injectable({
  providedIn: 'root',
})
export class PostService {
  private endPoint = environment.apiPostEndpoint;
  private http = inject(HttpClient)

  createBlog(postData: Post): Observable<apiResponse<Post>>{
    return this.http.post<apiResponse<Post>>(`${this.endPoint}`, postData);
  }
}
