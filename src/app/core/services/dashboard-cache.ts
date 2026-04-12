import { Injectable } from '@angular/core';

interface DashboardSnapshot {
  posts: any[];
  users: any[];
}

interface UserSnapshot {
  posts:    any[];
  cachedAt: number;
}

/**
 * In-memory cache for the admin / user-home dashboard data.
 *
 * Both dashboards load 1 000+ records on every mount, which causes a slow
 * first-paint on every navigation.  This service holds the last fetch for up
 * to TTL_MS (5 minutes) so that navigating back to the dashboard is instant.
 *
 * Pattern:
 *   1. On mount, call `get()` (admin) or `getUserPosts(userId)` (user).
 *   2. If data is returned, render immediately and call `isStale()` /
 *      `isUserDataStale(userId)` to decide whether to silently refresh.
 *   3. After every fresh fetch, call `set(posts, users)` or
 *      `setUserPosts(userId, posts)`.
 */
@Injectable({ providedIn: 'root' })
export class DashboardCache {
  private _data:     DashboardSnapshot | null = null;
  private _cachedAt: number | null = null;
  private _userSnapshots = new Map<string, UserSnapshot>();

  /** Hard expiry — data older than this is always refetched. */
  private readonly TTL_MS   = 5 * 60 * 1000;  // 5 minutes

  /** Soft staleness — data older than this triggers a background refresh
   *  while still serving cached content instantly. */
  private readonly STALE_MS = 60 * 1_000;      // 60 seconds

  // ── Admin dashboard (posts + users) ───────────────────────────────────────

  /** Returns cached admin data if still within TTL, otherwise null. */
  get(): DashboardSnapshot | null {
    if (!this._data || !this._cachedAt) return null;
    if (Date.now() - this._cachedAt > this.TTL_MS) {
      this.invalidate();
      return null;
    }
    return this._data;
  }

  /** True when the admin cache exists but is older than STALE_MS. */
  isStale(): boolean {
    if (!this._cachedAt) return false;
    return Date.now() - this._cachedAt > this.STALE_MS;
  }

  /** Milliseconds since the admin cache was populated, or null if empty. */
  getAge(): number | null {
    return this._cachedAt ? Date.now() - this._cachedAt : null;
  }

  set(posts: any[], users: any[]): void {
    this._data     = { posts, users };
    this._cachedAt = Date.now();
  }

  invalidate(): void {
    this._data     = null;
    this._cachedAt = null;
  }

  // ── User dashboard (per-userId posts) ─────────────────────────────────────

  /** Returns cached posts for a specific user if still within TTL, else null. */
  getUserPosts(userId: string): any[] | null {
    const entry = this._userSnapshots.get(userId);
    if (!entry) return null;
    if (Date.now() - entry.cachedAt > this.TTL_MS) {
      this._userSnapshots.delete(userId);
      return null;
    }
    return entry.posts;
  }

  /** True when the user cache exists but is older than STALE_MS. */
  isUserDataStale(userId: string): boolean {
    const entry = this._userSnapshots.get(userId);
    if (!entry) return false;
    return Date.now() - entry.cachedAt > this.STALE_MS;
  }

  /** Milliseconds since the user cache was populated, or null if empty. */
  getUserDataAge(userId: string): number | null {
    const entry = this._userSnapshots.get(userId);
    return entry ? Date.now() - entry.cachedAt : null;
  }

  setUserPosts(userId: string, posts: any[]): void {
    this._userSnapshots.set(userId, { posts, cachedAt: Date.now() });
  }

  invalidateUser(userId: string): void {
    this._userSnapshots.delete(userId);
  }
}
