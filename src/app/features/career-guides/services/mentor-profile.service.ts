import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { Auth } from '../../../core/services/auth';
import { MentorAvailabilityStatus, MentorProfileRecord } from '../models/mentor-profile.model';

interface ProfileResponse { status: number; data: MentorProfileRecord | null; }
interface UpdateResponse { status: number; message: string; data: MentorProfileRecord; }
interface MentorProfileWithSlug extends MentorProfileRecord { mentorSlug: string; }
interface ListResponse { status: number; data: MentorProfileWithSlug[]; }

@Injectable({ providedIn: 'root' })
export class MentorProfileService {
  private http = inject(HttpClient);
  private auth = inject(Auth);

  private headers(): HttpHeaders | undefined {
    const token = this.auth.getToken();
    return token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : undefined;
  }

  /** The mentor's own editable profile (null if not filled in yet). Self or admin only. */
  getByUserId(userId: string): Observable<ProfileResponse> {
    const h = this.headers();
    return this.http.get<ProfileResponse>(`${environment.apiUrl}/mentor-profile/${userId}`, h ? { headers: h } : {});
  }

  /** Upsert the mentor's own profile. Self or admin only; 403s if not an approved mentor. */
  update(userId: string, payload: Partial<MentorProfileRecord>): Observable<UpdateResponse> {
    const h = this.headers();
    return this.http.put<UpdateResponse>(`${environment.apiUrl}/mentor-profile/${userId}`, payload, h ? { headers: h } : {});
  }

  /** Public overlay data for the Career Guides profile page. */
  getBySlug(slug: string): Observable<ProfileResponse> {
    return this.http.get<ProfileResponse>(`${environment.apiUrl}/mentor-profile/by-slug/${slug}`);
  }

  /** Public bulk list of every mentor's profile override, for marketplace cards. */
  getAll(): Observable<ListResponse> {
    return this.http.get<ListResponse>(`${environment.apiUrl}/mentor-profile`);
  }

  /** Mentor marks a whole day unavailable. Self or admin only. */
  addBlockedDate(userId: string, date: string): Observable<UpdateResponse> {
    const h = this.headers();
    return this.http.post<UpdateResponse>(`${environment.apiUrl}/mentor-profile/${userId}/blocked-dates`, { date }, h ? { headers: h } : {});
  }

  /** Mentor re-opens a previously blocked day. Self or admin only. */
  removeBlockedDate(userId: string, date: string): Observable<UpdateResponse> {
    const h = this.headers();
    return this.http.delete<UpdateResponse>(`${environment.apiUrl}/mentor-profile/${userId}/blocked-dates/${date}`, h ? { headers: h } : {});
  }

  /** Mentor toggles their own live Available/Busy/Unavailable status. Self or admin only. */
  updateAvailability(userId: string, status: MentorAvailabilityStatus): Observable<UpdateResponse> {
    const h = this.headers();
    return this.http.patch<UpdateResponse>(`${environment.apiUrl}/mentor-profile/${userId}/availability`, { status }, h ? { headers: h } : {});
  }
}
