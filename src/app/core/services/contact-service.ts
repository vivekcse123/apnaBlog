import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environments.prod';

@Injectable({ providedIn: 'root' })
export class ContactService {
  private http = inject(HttpClient);
  
  private endPoint = environment.apiUrl;

  sendMessage(data: { name: string; email: string; subject: string; message: string }): Observable<any> {
    return this.http.post(`${this.endPoint}/contact/send`, data);
  }
  
}