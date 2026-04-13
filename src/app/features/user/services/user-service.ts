import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { apiResponse } from '../../../core/models/api-response.model';
import { User } from '../models/user.mode';
import { environment } from '../../../../environments/environments.prod';

@Injectable({
  providedIn: 'root',
})
export class UserService {
  private endPoint = environment.apiUserEndpoint;
  private http = inject(HttpClient);

  getUserById(id: string | null): Observable<apiResponse<User>> {
    return this.http.get<apiResponse<User>>(`${this.endPoint}${id}`);
  }

  updateUser(id: string, data: Partial<User>): Observable<apiResponse<User>> {
    return this.http.put<apiResponse<User>>(`${this.endPoint}${id}/update`, data);
  }

  uploadAvatar(file: File): Observable<{ url: string }> {
    const formData = new FormData();
    formData.append('avatar', file);
    return this.http.post<{ url: string }>(`${environment.apiUrl}/upload/avatar`, formData);
  }

  updateAvatar(userId: string, avatarUrl: string): Observable<apiResponse<User>> {
    return this.http.patch<apiResponse<User>>(`${this.endPoint}${userId}/avatar`, { avatarUrl });
  }

  followUser(authorId: string): Observable<{ status: number; data: { followersCount: number; isFollowing: boolean } }> {
    return this.http.post<{ status: number; data: { followersCount: number; isFollowing: boolean } }>(
      `${this.endPoint}${authorId}/follow`, {}
    );
  }

  unfollowUser(authorId: string): Observable<{ status: number; data: { followersCount: number; isFollowing: boolean } }> {
    return this.http.delete<{ status: number; data: { followersCount: number; isFollowing: boolean } }>(
      `${this.endPoint}${authorId}/unfollow`
    );
  }
}