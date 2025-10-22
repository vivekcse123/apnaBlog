import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class User {
  private userURL = "";
  constructor(private http: HttpClient){}

  editProfile(userData: User): Observable<any>{
    return this.http.post<any>(`${this.userURL}/edit-profile`, userData)
  }
}
