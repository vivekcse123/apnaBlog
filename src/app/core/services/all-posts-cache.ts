import { Injectable, signal } from '@angular/core';
import { Post } from '../models/post.model';

const TTL_MS = 5 * 60 * 1000; // 5 minutes

@Injectable({ providedIn: 'root' })
export class AllPostsCache {
  private _posts  = signal<Post[]>([]);
  private _setAt  = 0;

  /** All published posts, or empty array if cache is empty/expired. */
  get(): Post[] {
    if (!this._posts().length) return [];
    if (Date.now() - this._setAt > TTL_MS) { this.clear(); return []; }
    return this._posts();
  }

  /** True if the cache has fresh data ready. */
  isReady(): boolean { return this.get().length > 0; }

  set(posts: Post[]): void {
    this._posts.set(posts);
    this._setAt = Date.now();
  }

  clear(): void {
    this._posts.set([]);
    this._setAt = 0;
  }
}
