import { Injectable, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
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
  private platformId     = inject(PLATFORM_ID);
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
    return this.http.post<UploadResponse>(environment.apiVideoUploadEndpoint, formData);
  }

  // Direct browser → Cloudinary upload (eliminates the backend proxy hop).
  // Flow: get signed params from backend → upload straight to Cloudinary → return URL.
  uploadVideoWithProgress(file: File, startTime = 0, endTime?: number): Observable<{ percent: number } | UploadResponse> {
    return new Observable(observer => {
      if (!isPlatformBrowser(this.platformId)) {
        observer.error({ error: { message: 'Upload not supported server-side.' } });
        return;
      }

      const sigUrl = environment.apiVideoUploadEndpoint.replace(/\/video$/, '/video-signature');
      const token  = localStorage.getItem('token');
      let xhr: XMLHttpRequest | null = null;

      // Step 1 — fetch signing params from our backend (tiny request, no file involved)
      const sigXhr = new XMLHttpRequest();
      sigXhr.open('GET', sigUrl);
      if (token) sigXhr.setRequestHeader('Authorization', `Bearer ${token}`);

      sigXhr.addEventListener('load', () => {
        if (sigXhr.status < 200 || sigXhr.status >= 300) {
          observer.error({ status: sigXhr.status, error: { message: 'Could not get upload credentials.' } });
          return;
        }

        let sig: { signature: string; timestamp: number; api_key: string; cloud_name: string; folder: string };
        try { sig = JSON.parse(sigXhr.responseText); }
        catch { observer.error({ error: { message: 'Invalid signature response.' } }); return; }

        // Step 2 — upload the file directly to Cloudinary (single hop)
        const formData = new FormData();
        formData.append('file',      file);
        formData.append('api_key',   sig.api_key);
        formData.append('timestamp', String(sig.timestamp));
        formData.append('signature', sig.signature);
        formData.append('folder',    sig.folder);
        formData.append('resource_type', 'video');

        xhr = new XMLHttpRequest();
        xhr.open('POST', `https://api.cloudinary.com/v1_1/${sig.cloud_name}/video/upload`);

        xhr.upload.addEventListener('progress', e => {
          if (e.lengthComputable)
            observer.next({ percent: Math.round(100 * e.loaded / e.total) });
        });

        xhr.addEventListener('load', () => {
          try {
            const r = JSON.parse(xhr!.responseText);
            if (xhr!.status === 200) {
              const url          = this.buildVideoUrl(sig.cloud_name, r.public_id, startTime, endTime);
              const thumbnailUrl = this.buildVideoUrl(sig.cloud_name, r.public_id, startTime, endTime, true);
              const duration     = endTime !== undefined
                ? endTime - startTime
                : (r.duration ?? null);

              observer.next({ success: true, message: 'Uploaded', url, publicId: r.public_id, images: [], duration, thumbnailUrl } as UploadResponse);
              observer.complete();
            } else {
              observer.error({ status: xhr!.status, error: { message: r.error?.message ?? 'Cloudinary upload failed.' } });
            }
          } catch {
            observer.error({ status: xhr!.status, error: { message: 'Invalid Cloudinary response.' } });
          }
        });

        xhr.addEventListener('error', () =>
          observer.error({ status: 0, error: { message: 'Network error. Check your connection.' } })
        );

        xhr.send(formData);
      });

      sigXhr.addEventListener('error', () =>
        observer.error({ status: 0, error: { message: 'Network error fetching upload credentials.' } })
      );

      sigXhr.send();
      return () => { sigXhr.abort(); xhr?.abort(); };
    });
  }

  private buildVideoUrl(cloudName: string, publicId: string, startTime: number, endTime?: number, thumb = false): string {
    const transforms: string[] = [];
    if (startTime > 0 || endTime !== undefined) {
      const parts: string[] = [];
      if (startTime > 0)         parts.push(`so_${startTime.toFixed(2)}`);
      if (endTime !== undefined) parts.push(`eo_${endTime.toFixed(2)}`);
      transforms.push(parts.join(','));
    }
    transforms.push('q_auto');
    transforms.push('l_text:Arial_18_bold:ApnaInsights,co_white,o_55,g_north_east,x_10,y_10');
    const t   = transforms.join('/');
    const ext = thumb ? 'jpg' : 'mp4';
    return `https://res.cloudinary.com/${cloudName}/video/upload/${t}/${publicId}.${ext}`;
  }
}
