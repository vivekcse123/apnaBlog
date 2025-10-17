import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { Login } from '../auth/modals/login';
import { SignUp } from '../auth/modals/signup';

@Injectable({
  providedIn: 'root'
})
export class AuthService {

  constructor(private http: HttpClient) { }

  private authURL = "";

  statusInfo = new BehaviorSubject<boolean>(true);

  accountStatus$ = this.statusInfo.asObservable();

  updateStatus(status: boolean){
    this.statusInfo.next(status);
  }

 login(obj: Login): Observable<string> {
  return this.http.post<string>(`${this.authURL}/`, obj);
}

  signUp(obj: SignUp): Observable<string> {
    return this.http.post<string>(`${this.authURL}/`, obj);
  }

}
