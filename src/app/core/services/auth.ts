import { computed, inject, Injectable, PLATFORM_ID, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { apiResponse } from '../models/api-response.model';
import { User } from '../../features/user/models/user.mode';
import { isPlatformBrowser } from '@angular/common';
import { environment } from '../../../environments/environments.prod';

export interface ActiveSession {
  sessionId:  string;
  device:     string;
  ip:         string | null;
  createdAt:  string;
  lastActive: string;
  expiresAt:  string;
  current:    boolean;
}

@Injectable({
  providedIn: 'root',
})
export class Auth {
  private authEndpoint = environment.apiAuthEndpoint;

  private http = inject(HttpClient);
  private platformId = inject(PLATFORM_ID);
  private isBrowser = isPlatformBrowser(this.platformId);

  userId = signal<string | null>(
    this.isBrowser ? localStorage.getItem('userId') : null
  );

  userRole = signal<string | null>(
    this.isBrowser ? localStorage.getItem('role') : null
  );

  token = signal<string | null>(
    this.isBrowser ? localStorage.getItem('token') : null
  );

  sessionId = signal<string | null>(
    this.isBrowser ? localStorage.getItem('sessionId') : null
  );

  isAuthorized  = computed(() => !!this.token());
  isAdmin       = computed(() => this.userRole() === 'admin' || this.userRole() === 'super_admin');
  isSuperAdmin  = computed(() => this.userRole() === 'super_admin');

  login(userCred: { email: string; password: string }): Observable<apiResponse<User>> {
    return this.http.post<apiResponse<User>>(`${this.authEndpoint}login`, userCred).pipe(
      tap((res) => {
        const { _id, role, token, sessionId } = res.data as any;

        this.userId.set(_id);
        this.userRole.set(role);
        this.token.set(token);
        this.sessionId.set(sessionId ?? null);

        if (this.isBrowser) {
          localStorage.setItem('userId', _id);
          localStorage.setItem('role', role);
          localStorage.setItem('token', token);
          if (sessionId) localStorage.setItem('sessionId', sessionId);
        }
      })
    );
  }

  logout(): void {
    this.userId.set(null);
    this.userRole.set(null);
    this.token.set(null);
    this.sessionId.set(null);

    if (this.isBrowser) {
      localStorage.removeItem('userId');
      localStorage.removeItem('role');
      localStorage.removeItem('token');
      localStorage.removeItem('sessionId');
    }
  }

  getSessions(userId: string): Observable<{ status: number; data: ActiveSession[] }> {
    return this.http.get<{ status: number; data: ActiveSession[] }>(
      `${this.authEndpoint}${userId}/sessions`
    );
  }

  revokeSession(userId: string, sessionId: string): Observable<{ status: number; message: string }> {
    return this.http.delete<{ status: number; message: string }>(
      `${this.authEndpoint}${userId}/sessions/${sessionId}`
    );
  }

  register(userData: User): Observable<apiResponse<User>> {
    return this.http.post<apiResponse<User>>(`${this.authEndpoint}register`, userData);
  }

  changePassword(id: string | null, currentPassword: string, newPassword: string): Observable<{ status: number; message: string; data: User }> {
    return this.http.put<{ status: number; message: string; data: User }>(
      `${this.authEndpoint}${id}/change-password`,
      { currentPassword, newPassword }
    );
  }


  forgotPassword(email: string): Observable<{ status: number; message: string }> {
    return this.http.post<{ status: number; message: string }>(
      `${this.authEndpoint}forgot-password`,
      { email }
    );
  }

  resetPassword(token: string, newPassword: string): Observable<{ status: number; message: string }> {
    const payload = { token, newPassword };
    const url = `${this.authEndpoint}reset-password`;
    return this.http.put<{ status: number; message: string }>(url, payload);
  }

  getToken(): string | null {
    return this.isBrowser ? localStorage.getItem('token') : null;
  }

  getCurrentUser() {
    if (!this.isBrowser) return null;

    const userId = localStorage.getItem('userId');
    const role = localStorage.getItem('role');
    if (!userId || !role) return null;
    return { id: userId, role };
  }
}