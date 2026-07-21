import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { Auth } from '../../../core/services/auth';
import { MentorApplicationRecord, MentorApplicationStatus, SubmitMentorApplicationPayload } from '../models/mentor-application.model';

interface ItemResponse { status: number; message?: string; data: MentorApplicationRecord; }
interface OptionalItemResponse { status: number; data: MentorApplicationRecord | null; }
interface ListResponse { status: number; data: MentorApplicationRecord[]; }

@Injectable({ providedIn: 'root' })
export class MentorApplicationService {
  private http = inject(HttpClient);
  private auth = inject(Auth);

  private headers(): HttpHeaders | undefined {
    const token = this.auth.getToken();
    return token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : undefined;
  }

  /** Submit a new application. 409s if already a mentor or already has a pending one. */
  submit(payload: SubmitMentorApplicationPayload): Observable<ItemResponse> {
    const h = this.headers();
    return this.http.post<ItemResponse>(`${environment.apiUrl}/mentor-applications`, payload, h ? { headers: h } : {});
  }

  /** The current user's own latest application (any status), or null if never applied. */
  mine(): Observable<OptionalItemResponse> {
    const h = this.headers();
    return this.http.get<OptionalItemResponse>(`${environment.apiUrl}/mentor-applications/mine`, h ? { headers: h } : {});
  }

  /** Admin: list all applications, optionally filtered by status. */
  list(status?: MentorApplicationStatus): Observable<ListResponse> {
    const h = this.headers();
    const url = status ? `${environment.apiUrl}/mentor-applications?status=${status}` : `${environment.apiUrl}/mentor-applications`;
    return this.http.get<ListResponse>(url, h ? { headers: h } : {});
  }

  /** Admin: approve an application and grant mentor status with the given slug. */
  approve(id: string, mentorSlug: string): Observable<ItemResponse> {
    const h = this.headers();
    return this.http.patch<ItemResponse>(`${environment.apiUrl}/mentor-applications/${id}/approve`, { mentorSlug }, h ? { headers: h } : {});
  }

  /** Admin: reject an application with an optional reason. */
  reject(id: string, reason?: string): Observable<ItemResponse> {
    const h = this.headers();
    return this.http.patch<ItemResponse>(`${environment.apiUrl}/mentor-applications/${id}/reject`, { reason }, h ? { headers: h } : {});
  }
}
