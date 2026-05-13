import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, catchError, tap } from 'rxjs';
import { Auth } from './auth';
import { environment } from '../../../environments/environment';

const LS_KEY = 'apna_bookmarked_posts';

@Injectable({ providedIn: 'root' })
export class BookmarkService {
  private http = inject(HttpClient);
  private auth = inject(Auth);
  private endpoint = environment.apiUserEndpoint;

  /** Signal of bookmarked post IDs — source of truth for all UI. */
  bookmarkedIds = signal<Set<string>>(this._readLocal());

  // ── Initialisation ────────────────────────────────────────────────────────

  /** Call once on app init (e.g. home ngOnInit) to sync localStorage → server. */
  syncFromServer(): void {
    const userId = this.auth.userId();
    if (!userId) return;

    this.http.get<{ status: number; data: string[] }>(
      `${this.endpoint}${userId}/bookmark-ids`
    ).pipe(catchError(() => of(null))).subscribe(res => {
      if (!res) return;
      const serverIds = new Set(res.data);
      // Merge: keep anything in localStorage that server doesn't have (offline adds)
      const local = this._readLocal();
      const merged = new Set([...serverIds, ...local]);
      this.bookmarkedIds.set(merged);
      this._writeLocal(merged);
    });
  }

  // ── Public API ────────────────────────────────────────────────────────────

  isBookmarked(postId: string): boolean {
    return this.bookmarkedIds().has(postId);
  }

  toggle(postId: string): void {
    const current = new Set(this.bookmarkedIds());
    const adding  = !current.has(postId);

    // Optimistic update
    if (adding) current.add(postId); else current.delete(postId);
    this.bookmarkedIds.set(current);
    this._writeLocal(current);

    // Persist to server if logged in
    const userId = this.auth.userId();
    if (!userId) return;

    const req$: Observable<any> = adding
      ? this.http.post(`${this.endpoint}${userId}/bookmark/${postId}`, {})
      : this.http.delete(`${this.endpoint}${userId}/bookmark/${postId}`);

    req$.pipe(catchError(() => {
      // Rollback on failure
      const rollback = new Set(this.bookmarkedIds());
      if (adding) rollback.delete(postId); else rollback.add(postId);
      this.bookmarkedIds.set(rollback);
      this._writeLocal(rollback);
      return of(null);
    })).subscribe();
  }

  /** Fetch full bookmark posts (for bookmarks page). */
  getBookmarkedPosts(userId: string, page = 1, limit = 20): Observable<any> {
    return this.http.get<any>(`${this.endpoint}${userId}/bookmarks?page=${page}&limit=${limit}`)
      .pipe(catchError(() => of({ status: 200, data: [], total: 0, totalPages: 0 })));
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private _readLocal(): Set<string> {
    try {
      const s = localStorage.getItem(LS_KEY);
      return s ? new Set(JSON.parse(s)) : new Set();
    } catch { return new Set(); }
  }

  private _writeLocal(ids: Set<string>): void {
    try { localStorage.setItem(LS_KEY, JSON.stringify([...ids])); } catch { /* quota */ }
  }
}
