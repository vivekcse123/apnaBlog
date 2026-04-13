import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environments.prod';

export interface UploadResponse {
  success:  boolean;
  message:  string;
  url:      string;
  publicId: string;
}

@Injectable({ providedIn: 'root' })
export class UploadService {
  private http           = inject(HttpClient);
  private uploadEndpoint = environment.apiUploadEndpoint; 

  uploadImage(file: File): Observable<UploadResponse> {
    const formData = new FormData();
    formData.append('image', file);
    return this.http.post<UploadResponse>(this.uploadEndpoint, formData);
  }

  deleteImage(publicId: string): Observable<{ success: boolean }> {
    return this.http.delete<{ success: boolean }>(
      `${this.uploadEndpoint}/${encodeURIComponent(publicId)}`
    );
  }
}