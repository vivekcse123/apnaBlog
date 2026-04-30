import { Injectable } from '@angular/core';
import { Post } from '../models/post.model';

export interface HistoryEntry {
  id:         string;
  slug?:      string;
  title:      string;
  categories: string[];
  tags:       string[];
  readAt:     number;
}

const HISTORY_KEY = 'apna_read_history';
const MAX_ENTRIES = 50;

@Injectable({ providedIn: 'root' })
export class ReadingHistory {
  private _entries: HistoryEntry[] = [];
  private _ids     = new Set<string>();

  constructor() { this._load(); }

  private _load(): void {
    try {
      if (typeof localStorage === 'undefined') return;
      const raw = localStorage.getItem(HISTORY_KEY);
      if (!raw) return;
      const parsed: HistoryEntry[] = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        this._entries = parsed;
        parsed.forEach(e => this._ids.add(e.id));
      }
    } catch { /* SSR / quota */ }
  }

  add(post: Post): void {
    // Move to top if re-reading
    this._entries = this._entries.filter(e => e.id !== post._id);
    this._ids.add(post._id);

    this._entries.unshift({
      id:         post._id,
      slug:       (post as any).slug,
      title:      post.title,
      categories: post.categories ?? [],
      tags:       (post as any).tags    ?? [],
      readAt:     Date.now(),
    });

    // Cap to MAX_ENTRIES (FIFO)
    if (this._entries.length > MAX_ENTRIES) {
      const removed = this._entries.splice(MAX_ENTRIES);
      removed.forEach(e => {
        // Only delete id if no other entry references it (shouldn't happen but safe)
        if (!this._entries.some(r => r.id === e.id)) this._ids.delete(e.id);
      });
    }

    this._persist();
  }

  isRead(id: string): boolean { return this._ids.has(id); }

  getEntries(): HistoryEntry[] { return this._entries; }

  getCount(): number { return this._entries.length; }

  /**
   * Returns top categories by read frequency, most-read first.
   * Used by the recommendation engine in the home component.
   */
  getTopCategories(limit = 3): string[] {
    const freq: Record<string, number> = {};
    for (const e of this._entries) {
      for (const cat of e.categories) {
        freq[cat] = (freq[cat] ?? 0) + 1;
      }
    }
    return Object.entries(freq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([cat]) => cat);
  }

  private _persist(): void {
    try {
      if (typeof localStorage === 'undefined') return;
      localStorage.setItem(HISTORY_KEY, JSON.stringify(this._entries));
    } catch { /* quota exceeded */ }
  }
}
