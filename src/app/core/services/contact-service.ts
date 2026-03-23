import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class ContactService {
  private http = inject(HttpClient);
  private endPoint = 'http://localhost:3000/api/contact/';

  sendMessage(data: { name: string; email: string; subject: string; message: string }): Observable<any> {
    return this.http.post(`${this.endPoint}send`, data);
  }
  
}