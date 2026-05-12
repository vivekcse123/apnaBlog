import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, tap, catchError, shareReplay, finalize } from 'rxjs';
import { environment } from '../../../environments/environments.prod';

export interface TaxonomyItem {
  _id:      string;
  type:     'category' | 'tag';
  name:     string;
  slug:     string;
  emoji:    string;
  isActive: boolean;
  order:    number;
  createdAt: string;
  updatedAt: string;
}

interface TaxonomyResponse {
  status: number;
  data:   TaxonomyItem[];
}

const CACHE_KEY = 'apna_taxonomy_v1';
const TTL_MS    = 10 * 60 * 1000; // 10 minutes

interface StoredTaxonomy {
  categories: TaxonomyItem[];
  tags:       TaxonomyItem[];
  ts:         number;
}

function readCache(): StoredTaxonomy | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed: StoredTaxonomy = JSON.parse(raw);
    if (Date.now() - parsed.ts > TTL_MS) return null;
    return parsed;
  } catch { return null; }
}

function writeCache(categories: TaxonomyItem[], tags: TaxonomyItem[]): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ categories, tags, ts: Date.now() }));
    }
  } catch { /* quota */ }
}

@Injectable({ providedIn: 'root' })
export class TaxonomyService {
  private http     = inject(HttpClient);
  private endpoint = `${environment.apiUrl}/taxonomy`;

  // In-memory signals — hydrated from localStorage immediately
  private _cached = readCache();
  categories = signal<TaxonomyItem[]>(this._cached?.categories ?? []);
  tags       = signal<TaxonomyItem[]>(this._cached?.tags       ?? []);
  loaded     = signal(!!this._cached);

  // In-flight dedup
  private _inflight: Observable<void> | null = null;

  /** Load both categories and tags (deduplicated, cached). */
  load(): Observable<void> {
    if (this.loaded()) return of(void 0);
    if (this._inflight) return this._inflight;

    this._inflight = new Observable<void>(obs => {
      this.http.get<TaxonomyResponse>(`${this.endpoint}`)
        .pipe(catchError(() => of({ status: 200, data: [] as TaxonomyItem[] })))
        .subscribe(res => {
          const cats = res.data.filter(i => i.type === 'category');
          const tgs  = res.data.filter(i => i.type === 'tag');
          this.categories.set(cats);
          this.tags.set(tgs);
          this.loaded.set(true);
          writeCache(cats, tgs);
          obs.next();
          obs.complete();
        });
    }).pipe(shareReplay(1), finalize(() => { this._inflight = null; }));

    return this._inflight;
  }

  /** Force-refresh from server (called after mutations). */
  refresh(): Observable<void> {
    this.loaded.set(false);
    this._inflight = null;
    return this.load();
  }

  /** All items (admin view — includes inactive). */
  loadAll(): Observable<TaxonomyResponse> {
    return this.http.get<TaxonomyResponse>(`${this.endpoint}/all`)
      .pipe(
        tap(res => {
          const cats = res.data.filter(i => i.type === 'category');
          const tgs  = res.data.filter(i => i.type === 'tag');
          this.categories.set(cats.filter(c => c.isActive));
          this.tags.set(tgs.filter(t => t.isActive));
          writeCache(cats.filter(c => c.isActive), tgs.filter(t => t.isActive));
        }),
        catchError(() => of({ status: 200, data: [] as TaxonomyItem[] })),
      );
  }

  add(payload: { type: 'category' | 'tag'; name: string; emoji?: string; order?: number }): Observable<TaxonomyResponse> {
    return this.http.post<TaxonomyResponse>(this.endpoint, payload);
  }

  update(id: string, payload: Partial<{ name: string; emoji: string; order: number; isActive: boolean }>): Observable<TaxonomyResponse> {
    return this.http.patch<TaxonomyResponse>(`${this.endpoint}/${id}`, payload);
  }

  remove(id: string): Observable<{ status: number; message: string }> {
    return this.http.delete<{ status: number; message: string }>(`${this.endpoint}/${id}`);
  }

  /** Convenience: names only, for use in templates/pipes. */
  categoryNames(): string[] {
    return this.categories().map(c => c.name);
  }

  tagNames(): string[] {
    return this.tags().map(t => t.name);
  }

  categoryEmojiMap(): Record<string, string> {
    const map: Record<string, string> = {};
    for (const c of this.categories()) map[c.name] = c.emoji;
    return map;
  }

  invalidateCache(): void {
    try { if (typeof localStorage !== 'undefined') localStorage.removeItem(CACHE_KEY); } catch { /* */ }
  }
}
