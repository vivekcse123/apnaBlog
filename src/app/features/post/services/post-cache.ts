import { Injectable, signal } from '@angular/core';
import { Post } from '../../../core/models/post.model';

interface PostWithTs extends Post { _ts: number; }

@Injectable({ providedIn: 'root' })
export class PostCache {
  private _cache   = signal<PostWithTs[] | null>(null);
  private _cachedAt: number | null = null;
  private readonly TTL_MS = 2 * 60 * 1000;

  get(): PostWithTs[] | null {
    if (!this._cache() || !this._cachedAt) return null;
    
    if (Date.now() - this._cachedAt > this.TTL_MS) {
      this._cache.set(null);
      return null;
    }
    return this._cache();
  }

  set(posts: PostWithTs[]): void {
    this._cache.set(posts);
    this._cachedAt = Date.now();
  }

  invalidate(): void {
    this._cache.set(null);
    this._cachedAt = null;
  }
}