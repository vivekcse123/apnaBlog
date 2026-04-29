import { Injectable } from '@angular/core';

interface Slice<T> {
  data:     T;
  cachedAt: number;
}

/**
 * In-memory cache for admin/user dashboard data.
 *
 * Each data type has its own independent slot so that loading ManageBlogs
 * can never corrupt ManageUsers' cached data and vice-versa.
 *
 * Pattern:
 *   1. On mount, call the typed getter (e.g. getAdminPosts()).
 *   2. If data returned, render immediately; call isXStale() to decide
 *      whether to background-refresh.
 *   3. After each fresh fetch, call the typed setter.
 *   4. After any mutation, call the typed invalidator.
 */
@Injectable({ providedIn: 'root' })
export class DashboardCache {

  /** Hard expiry — always refetch after this. */
  private readonly TTL_MS   = 5 * 60 * 1_000;   // 5 min

  /** Soft staleness — triggers a silent background refresh while serving
   *  cached content instantly. 30 s gives a "real-time" feel on tab switch. */
  private readonly STALE_MS = 30 * 1_000;        // 30 s

  // ── Admin posts ─────────────────────────────────────────────────────────────
  private _posts: Slice<any[]> | null = null;

  getAdminPosts(): any[] | null {
    if (!this._posts) return null;
    if (Date.now() - this._posts.cachedAt > this.TTL_MS) { this._posts = null; return null; }
    return this._posts.data;
  }
  isAdminPostsStale(): boolean {
    return !!this._posts && Date.now() - this._posts.cachedAt > this.STALE_MS;
  }
  setAdminPosts(posts: any[]): void { this._posts = { data: posts, cachedAt: Date.now() }; }
  invalidateAdminPosts(): void { this._posts = null; }

  // ── Admin users (regular admin — role=user filtered list) ───────────────────
  private _users: Slice<any[]> | null = null;

  getAdminUsers(): any[] | null {
    if (!this._users) return null;
    if (Date.now() - this._users.cachedAt > this.TTL_MS) { this._users = null; return null; }
    return this._users.data;
  }
  isAdminUsersStale(): boolean {
    return !!this._users && Date.now() - this._users.cachedAt > this.STALE_MS;
  }
  setAdminUsers(users: any[]): void { this._users = { data: users, cachedAt: Date.now() }; }
  invalidateAdminUsers(): void { this._users = null; }

  // ── Raw users (super-admin — unfiltered list) ───────────────────────────────
  private _rawUsers: Slice<any[]> | null = null;

  getRawUsers(): any[] | null {
    if (!this._rawUsers) return null;
    if (Date.now() - this._rawUsers.cachedAt > this.TTL_MS) { this._rawUsers = null; return null; }
    return this._rawUsers.data;
  }
  isRawUsersStale(): boolean {
    return !!this._rawUsers && Date.now() - this._rawUsers.cachedAt > this.STALE_MS;
  }
  setRawUsers(users: any[]): void { this._rawUsers = { data: users, cachedAt: Date.now() }; }
  invalidateRawUsers(): void { this._rawUsers = null; }

  // ── User posts (per-userId, for the user-home dashboard) ────────────────────
  private _userPosts = new Map<string, Slice<any[]>>();

  getUserPosts(userId: string): any[] | null {
    const s = this._userPosts.get(userId);
    if (!s) return null;
    if (Date.now() - s.cachedAt > this.TTL_MS) { this._userPosts.delete(userId); return null; }
    return s.data;
  }
  isUserDataStale(userId: string): boolean {
    const s = this._userPosts.get(userId);
    return !!s && Date.now() - s.cachedAt > this.STALE_MS;
  }
  getUserDataAge(userId: string): number | null {
    const s = this._userPosts.get(userId);
    return s ? Date.now() - s.cachedAt : null;
  }
  setUserPosts(userId: string, posts: any[]): void {
    this._userPosts.set(userId, { data: posts, cachedAt: Date.now() });
  }
  invalidateUser(userId: string): void { this._userPosts.delete(userId); }

  // ── Combined helpers used by AdminHome (dashboard needs both at once) ────────

  /**
   * Returns both posts AND users only when both independent slots are populated.
   * AdminHome uses this to build the full dashboard in one go.
   */
  get(): { posts: any[]; users: any[] } | null {
    const posts = this.getAdminPosts();
    const users = this.getAdminUsers();
    if (!posts || !users) return null;
    return { posts, users };
  }

  /** True if either slot is stale (dashboard should background-refresh). */
  isStale(): boolean {
    return this.isAdminPostsStale() || this.isAdminUsersStale();
  }

  /** Milliseconds since the posts slot was populated (used by AdminHome). */
  getAge(): number | null {
    return this._posts ? Date.now() - this._posts.cachedAt : null;
  }

  /** Populates both slots simultaneously — called by AdminHome after forkJoin. */
  set(posts: any[], users: any[]): void {
    this.setAdminPosts(posts);
    this.setAdminUsers(users);
  }

  /** Clears both the posts and users slots. */
  invalidate(): void {
    this.invalidateAdminPosts();
    this.invalidateAdminUsers();
  }
}
