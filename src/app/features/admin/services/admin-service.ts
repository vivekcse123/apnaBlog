import { inject, Injectable } from '@angular/core';
import { map, Observable, tap } from 'rxjs';
import { apiResponse } from '../../../core/models/api-response.model';
import { User } from '../../user/models/user.mode';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environments.prod';

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

freezeUser(userId: string | null): Observable<apiResponse<User>>{
  return this.http.patch<apiResponse<User>>(`${this.endPoint}${userId}/freeze`, {});
}

unFreezeUser(userId: string): Observable<apiResponse<User>> {
  return this.http.patch<apiResponse<User>>(`${this.endPoint}${userId}/unfreeze`,{});
}

updateUser(userId: string, userData: Partial<User>): Observable<apiResponse<User>> {
  return this.http.put<apiResponse<User>>(`${this.endPoint}${userId}/update`, userData);
}

deleteUser(userId: string): Observable<apiResponse<User>>{
  return this.http.delete<apiResponse<User>>(`${this.endPoint}${userId}/delete`);
}

requestDeleteUser(userId: string): Observable<any> {
  return this.http.patch(`${this.endPoint}/users/${userId}/request-delete`, {});
}


cancelDeleteUser(userId: string): Observable<any> {
    return this.http.patch(`${this.endPoint}/${userId}/cancel-delete`, {});
}

}