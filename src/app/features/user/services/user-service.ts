import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, shareReplay, finalize, tap, throwError } from 'rxjs';
import { apiResponse } from '../../../core/models/api-response.model';
import { User } from '../models/user.mode';
import { environment } from '../../../../environments/environments.prod';

@Injectable({ providedIn: 'root' })
export class UserService {
  private endPoint = environment.apiUserEndpoint;
  private http     = inject(HttpClient);

  private readonly TTL_MS   = 5 * 60 * 1000;
  private readonly _cache   = new Map<string, { res: apiResponse<User>; ts: number }>();
  private readonly _inflight = new Map<string, Observable<apiResponse<User>>>();

  getUserById(id: string | null): Observable<apiResponse<User>> {
    if (!id) return throwError(() => new Error('No user ID'));

    const hit = this._cache.get(id);
    if (hit && Date.now() - hit.ts < this.TTL_MS) return of(hit.res);

    if (!this._inflight.has(id)) {
      this._inflight.set(id,
        this.http.get<apiResponse<User>>(`${this.endPoint}${id}`).pipe(
          tap(res => { this._cache.set(id, { res, ts: Date.now() }); }),
          shareReplay(1),
          finalize(() => this._inflight.delete(id))
        )
      );
    }
    return this._inflight.get(id)!;
  }

  /** Call after mutating user data (avatar, profile update) so next read is fresh. */
  invalidate(id: string): void {
    this._cache.delete(id);
    this._inflight.delete(id);
  }

  updateUser(id: string, data: Partial<User>): Observable<apiResponse<User>> {
    this.invalidate(id);
    return this.http.put<apiResponse<User>>(`${this.endPoint}${id}/update`, data).pipe(
      tap(() => this.invalidate(id))
    );
  }

  uploadAvatar(file: File): Observable<{ success: boolean; url: string }> {
    const formData = new FormData();
    formData.append('avatar', file);
    return this.http.post<{ success: boolean; url: string }>(`${environment.apiUrl}/upload/avatar`, formData);
  }

  updateAvatar(userId: string, avatarUrl: string): Observable<apiResponse<User>> {
    this.invalidate(userId);
    return this.http.patch<apiResponse<User>>(`${this.endPoint}${userId}/avatar`, { avatarUrl }).pipe(
      tap(() => this.invalidate(userId))
    );
  }

  removeAvatar(userId: string): Observable<apiResponse<User>> {
    this.invalidate(userId);
    return this.http.delete<apiResponse<User>>(`${this.endPoint}${userId}/avatar`).pipe(
      tap(() => this.invalidate(userId))
    );
  }

  getFollowers(userId: string): Observable<{ status: number; data: any[] }> {
    return this.http.get<{ status: number; data: any[] }>(`${this.endPoint}${userId}/followers`);
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