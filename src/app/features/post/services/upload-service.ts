import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpEventType, HttpRequest } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, filter, map } from 'rxjs/operators';
import { environment } from '../../../../environments/environments.prod';

export interface UploadResponse {
  success:  boolean;
  message:  string;
  url:      string;
  publicId: string;
}

export interface UploadProgress {
  progress: number;
  response?: UploadResponse;
}

@Injectable({ providedIn: 'root' })
export class UploadService {
  private http = inject(HttpClient);

  /**
   * Derives the upload base URL defensively:
   *   - If the env key is a full URL (http://…/api/upload) → use it as-is
   *   - If it is missing / falsy                           → fall back to apiUrl + /upload
   */
  private get uploadEndpoint(): string {
    const raw = (environment as any).apiUploadEndpoint as string | undefined;
    if (raw) return raw.replace(/\/+$/, '');                          // strip trailing slash
    const base = ((environment as any).apiUrl as string ?? '').replace(/\/+$/, '');
    return `${base}/upload`;
  }

  // ── Upload (with optional progress tracking) ──────────────────────────────

  uploadImage(file: File): Observable<UploadResponse> {
    if (!file) {
      return throwError(() => new Error('No file provided'));
    }

    const formData = new FormData();
    formData.append('image', file);

    /**
     * Do NOT set Content-Type manually for FormData.
     * The browser must set it automatically so that the multipart boundary
     * is included (e.g. "multipart/form-data; boundary=----WebKit…").
     * A manually set Content-Type header omits the boundary and the server
     * will reject the request with 400 / "route not found".
     */
    return this.http
      .post<UploadResponse>(this.uploadEndpoint, formData)
      .pipe(
        catchError(err => {
          const msg = err?.error?.message ?? err?.message ?? 'Upload failed';
          return throwError(() => new Error(msg));
        })
      );
  }

  /** Same as uploadImage but emits progress percentage (0–100) then the final response. */
  uploadImageWithProgress(file: File): Observable<UploadProgress> {
    if (!file) {
      return throwError(() => new Error('No file provided'));
    }

    const formData = new FormData();
    formData.append('image', file);

    const req = new HttpRequest('POST', this.uploadEndpoint, formData, {
      reportProgress: true,
    });

    return this.http.request<UploadResponse>(req).pipe(
      filter(event =>
        event.type === HttpEventType.UploadProgress ||
        event.type === HttpEventType.Response
      ),
      map(event => {
        if (event.type === HttpEventType.UploadProgress) {
          const progress = event.total
            ? Math.round((100 * event.loaded) / event.total)
            : 0;
          return { progress };
        }
        // HttpEventType.Response
        return { progress: 100, response: (event as any).body as UploadResponse };
      }),
      catchError(err => {
        const msg = err?.error?.message ?? err?.message ?? 'Upload failed';
        return throwError(() => new Error(msg));
      })
    );
  }

  // ── Delete ─────────────────────────────────────────────────────────────────

  deleteImage(publicId: string): Observable<{ success: boolean }> {
    if (!publicId) {
      return throwError(() => new Error('publicId is required'));
    }

    /**
     * Cloudinary public IDs may contain "/" (e.g. "blog/post-hero").
     * encodeURIComponent turns "/" into "%2F" which Express treats as a
     * literal segment separator → 404.  Use encodeURIComponent on each
     * segment individually, then join with "/".
     */
    const safePath = publicId
      .split('/')
      .map(segment => encodeURIComponent(segment))
      .join('/');

    return this.http
      .delete<{ success: boolean }>(`${this.uploadEndpoint}/${safePath}`)
      .pipe(
        catchError(err => {
          const msg = err?.error?.message ?? err?.message ?? 'Delete failed';
          return throwError(() => new Error(msg));
        })
      );
  }
}