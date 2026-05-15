import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';

export interface UploadResponse {
  success:      boolean;
  message:      string;
  url:          string;
  publicId:     string;
  images:       { url: string; publicId: string }[];
  // Video-upload fields (returned by /api/upload/video)
  duration?:     number;
  thumbnailUrl?: string;
}

@Injectable({ providedIn: 'root' })
export class UploadService {
  private http           = inject(HttpClient);
  private uploadEndpoint = environment.apiUploadEndpoint.replace(/\/+$/, '');

  uploadImage(file: File): Observable<UploadResponse> {
    const formData = new FormData();
    formData.append('images', file);
    return this.http.post<UploadResponse>(this.uploadEndpoint, formData);
  }

  uploadImages(files: File[]): Observable<UploadResponse> {
    const formData = new FormData();
    files.forEach(file => formData.append('images', file));
    return this.http.post<UploadResponse>(this.uploadEndpoint, formData);
  }

  deleteImage(publicId: string): Observable<{ success: boolean }> {
    return this.http.delete<{ success: boolean }>(
      `${this.uploadEndpoint}/${encodeURIComponent(publicId)}`
    );
  }

  uploadVideo(file: File, startTime = 0): Observable<UploadResponse> {
    const formData = new FormData();
    formData.append('video', file);
    if (startTime > 0) formData.append('startTime', String(startTime));
    return this.http.post<UploadResponse>(
      environment.apiVideoUploadEndpoint,
      formData
    );
  }
}
