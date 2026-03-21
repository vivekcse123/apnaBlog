import { inject, Injectable } from '@angular/core';
import { environment } from '../../../../environments/environment';
import { filter, map, Observable, tap } from 'rxjs';
import { apiResponse } from '../../../core/models/api-response.model';
import { User } from '../../user/models/user.mode';
import { HttpClient } from '@angular/common/http';

@Injectable({
  providedIn: 'root',
})
export class AdminService {
  private endPoint = environment.apiUserEndpoint;
  private http = inject(HttpClient);

 getAllUsers(page: number, limit: number): Observable<apiResponse<User[]>> {
  return this.http.get<apiResponse<User[]>>(`${this.endPoint}?page=${page}&limit=${limit}`)
    .pipe(
      map(res => ({
        ...res,
        data: res.data.filter(user => user.role === 'user')
      }))
    );
}

freezeUser(userId: string): Observable<apiResponse<User>>{
  return this.http.patch<apiResponse<User>>(`${this.endPoint}${userId}/freeze`, {}).pipe(
    tap((res) => console.log(res))
  )
}

unFreezeUser(userId: string): Observable<apiResponse<User>> {
  return this.http.patch<apiResponse<User>>(`${this.endPoint}${userId}/unfreeze`,{}).pipe(
    tap(res => console.log(res))
  );
}

updateUser(userId: string, userData: Partial<User>): Observable<apiResponse<User>> {
  return this.http.put<apiResponse<User>>(`${this.endPoint}${userId}/update`, userData).pipe(
    tap(res => console.log('Updated user:', res))
  );
}


// ─── Add these methods to your existing AdminService ───────────────────────

// Blog Settings
// getBlogSettings(): Observable<BlogSettings> {
//   return this.http.get<BlogSettings>(`${this.baseUrl}/settings/blog`);
// }

// updateBlogSettings(data: BlogSettings): Observable<BlogSettings> {
//   return this.http.patch<BlogSettings>(`${this.baseUrl}/settings/blog`, data);
// }

// // Categories
// getAllCategories(): Observable<Category[]> {
//   return this.http.get<Category[]>(`${this.baseUrl}/categories`);
// }

// createCategory(data: { name: string }): Observable<Category> {
//   return this.http.post<Category>(`${this.baseUrl}/categories`, data);
// }

// updateCategory(id: string, data: { name: string }): Observable<Category> {
//   return this.http.patch<Category>(`${this.baseUrl}/categories/${id}`, data);
// }

// // Tags
// getAllTags(): Observable<Tag[]> {
//   return this.http.get<Tag[]>(`${this.baseUrl}/tags`);
// }

// createTag(data: { name: string }): Observable<Tag> {
//   return this.http.post<Tag>(`${this.baseUrl}/tags`, data);
// }

// updateTag(id: string, data: { name: string }): Observable<Tag> {
//   return this.http.patch<Tag>(`${this.baseUrl}/tags/${id}`, data);
// }

// deleteTag(id: string): Observable<any> {
//   return this.http.delete(`${this.baseUrl}/tags/${id}`);
// }
}
