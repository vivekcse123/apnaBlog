import { inject, Injectable } from '@angular/core';
import { environment } from '../../../../environments/environment';
import { map, Observable, tap } from 'rxjs';
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

freezeUser(userId: string | null): Observable<apiResponse<User>>{
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

}