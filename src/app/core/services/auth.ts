import { computed, inject, Injectable, PLATFORM_ID, signal } from '@angular/core';
import { environment } from '../../../environments/environment';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { apiResponse } from '../models/api-response.model';
import { User } from '../../features/user/models/user.mode';
import { isPlatformBrowser } from '@angular/common';

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

  isAuthorized = computed(() => !!this.userId());

  login(userCred: { email: string; password: string }): Observable<apiResponse<User>> {
    return this.http.post<apiResponse<User>>(`${this.authEndpoint}login`, userCred).pipe(
      tap((res) => {
        const id = res.data._id;
        this.userId.set(id);

        if (this.isBrowser) {
          localStorage.setItem('userId', id);
        }
      })
    );
  }

  logout(): void {
    this.userId.set(null);
    if (this.isBrowser) {
      localStorage.removeItem('userId');
    }
  }

  register(userData: User): Observable<apiResponse<User>> {
    return this.http.post<apiResponse<User>>(`${this.authEndpoint}register`, userData).pipe(
      tap(res => console.log(res))
    );
  }

    
  changePassword(id: string | null, currentPassword: string, newPassword: string): Observable<{ status: number; message: string; data: User }> {
  return this.http.put<{ status: number; message: string; data: User }>(
    `${this.authEndpoint}${id}/change-password`,
    { currentPassword, newPassword }
  );
}
  
}