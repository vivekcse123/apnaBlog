import { inject, Injectable } from '@angular/core';
import { environment } from '../../../../environments/environment';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { apiResponse } from '../../../core/models/api-response.model';
import { User } from '../models/user.mode';

@Injectable({
  providedIn: 'root',
})
export class UserService {
  private endPoint = environment.apiUserEndpoint; 

  private http = inject(HttpClient);

  getUserById(id:  string | null): Observable<apiResponse<User>>{
    return this.http.get<apiResponse<User>>(`${this.endPoint}${id}`);
  }

  updateUser(id: string, data: Partial<User>): Observable<apiResponse<User>> {
    return this.http.put<apiResponse<User>>(`${this.endPoint}${id}/update`, data);
  }

  
}
