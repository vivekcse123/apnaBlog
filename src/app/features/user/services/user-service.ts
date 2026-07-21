import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, shareReplay, finalize, tap, throwError } from 'rxjs';
import { apiResponse } from '../../../core/models/api-response.model';
import { User } from '../models/user.mode';
import { environment } from '../../../../environments/environment';

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

  /** Resolves a Career Guides expert slug to the real mentor's user id, if one exists. */
  getUserByMentorSlug(slug: string): Observable<{ status: number; data?: { _id: string; name: string } }> {
    return this.http.get<{ status: number; data?: { _id: string; name: string } }>(`${this.endPoint}by-mentor-slug/${slug}`);
  }

  getFollowers(userId: string): Observable<{ status: number; data: any[] }> {
    return this.http.get<{ status: number; data: any[] }>(`${this.endPoint}${userId}/followers`);
  }

  /** Bulk real follower counts for every approved mentor, keyed by mentorSlug. */
  getMentorFollowerCounts(): Observable<{ status: number; data: { expertSlug: string; followersCount: number }[] }> {
    return this.http.get<{ status: number; data: { expertSlug: string; followersCount: number }[] }>(`${this.endPoint}mentor-followers`);
  }

  /** Admin-only: grant/revoke Career Guides mentor status + slug for a user. */
  setMentor(userId: string, payload: { isMentor: boolean; mentorSlug?: string }): Observable<apiResponse<User>> {
    this.invalidate(userId);
    return this.http.patch<apiResponse<User>>(`${this.endPoint}${userId}/set-mentor`, payload).pipe(
      tap(() => this.invalidate(userId))
    );
  }

  /** Admin: suspend/reactivate an existing mentor without touching account-wide login access. */
  setMentorStatus(userId: string, mentorStatus: 'active' | 'suspended'): Observable<apiResponse<User>> {
    this.invalidate(userId);
    return this.http.patch<apiResponse<User>>(`${this.endPoint}${userId}/mentor-status`, { mentorStatus }).pipe(
      tap(() => this.invalidate(userId))
    );
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

  getBookmarkedPosts(userId: string, page = 1, limit = 20): Observable<any> {
    return this.http.get<any>(`${this.endPoint}${userId}/bookmarks?page=${page}&limit=${limit}`);
  }

  getBookmarkIds(userId: string): Observable<{ status: number; data: string[] }> {
    return this.http.get<{ status: number; data: string[] }>(`${this.endPoint}${userId}/bookmark-ids`);
  }

  addBookmark(userId: string, postId: string): Observable<any> {
    return this.http.post(`${this.endPoint}${userId}/bookmark/${postId}`, {});
  }

  removeBookmark(userId: string, postId: string): Observable<any> {
    return this.http.delete(`${this.endPoint}${userId}/bookmark/${postId}`);
  }
}