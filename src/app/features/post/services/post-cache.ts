import { Injectable, signal } from '@angular/core';
import { Post } from '../../../core/models/post.model';

export interface PostWithTs extends Post { _ts: number; }

const STORE_KEY = 'apna_pc_v3';
const TTL_MS    = 5 * 60 * 1000; // 5 min

function readStorage(): { posts: PostWithTs[]; ts: number } | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed?.posts)) return null;
    return parsed;
  } catch { return null; }
}

@Injectable({ providedIn: 'root' })
export class PostCache {
  // Hydrate synchronously from localStorage — zero HTTP cost on reload
  private readonly _stored  = readStorage();
  private _posts    = signal<PostWithTs[]>(
    this._stored && Date.now() - this._stored.ts < TTL_MS ? this._stored.posts : []
  );
  private _cachedAt = this._stored && Date.now() - this._stored.ts < TTL_MS
    ? this._stored.ts : 0;

  /** All cached posts, or null if cache is empty / expired. */
  get(): PostWithTs[] | null {
    const posts = this._posts();
    if (!posts.length || !this._cachedAt) return null;
    if (Date.now() - this._cachedAt > TTL_MS) { this._clear(); return null; }
    return posts;
  }

  /** O(n) lookup by _id or slug — used by blog-detail for instant render. */
  getById(id: string): PostWithTs | null {
    const posts = this.get();
    return posts?.find(p => p._id === id || p.slug === id) ?? null;
  }

  /** Milliseconds since last set(), or null. */
  getAge(): number | null {
    return this._cachedAt ? Date.now() - this._cachedAt : null;
  }

  set(posts: PostWithTs[]): void {
    this._cachedAt = Date.now();
    this._posts.set(posts);
    this._persist(posts);
  }

  invalidate(): void { this._clear(); }

  private _clear(): void {
    this._posts.set([]);
    this._cachedAt = 0;
    try { localStorage.removeItem(STORE_KEY); } catch { /* SSR / quota */ }
  }

  private _persist(posts: PostWithTs[]): void {
    try {
      if (typeof localStorage === 'undefined') return;
      // Store only fields needed for instant render — keeps payload small
      localStorage.setItem(STORE_KEY, JSON.stringify({ posts, ts: this._cachedAt }));
    } catch { /* quota exceeded — silently skip */ }
  }
}
