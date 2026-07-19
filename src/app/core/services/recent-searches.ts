import { Injectable } from '@angular/core';

// Same key the home page's mega-search uses, so recent terms carry over
// between the hero search box and the dedicated /search page.
const KEY = 'apna_recent_searches';
const MAX_ENTRIES = 6;

@Injectable({ providedIn: 'root' })
export class RecentSearches {
  private _terms: string[] = [];

  constructor() { this._load(); }

  private _load(): void {
    try {
      if (typeof localStorage === 'undefined') return;
      const raw = localStorage.getItem(KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        this._terms = parsed.filter(s => typeof s === 'string').slice(0, MAX_ENTRIES);
      }
    } catch { /* SSR / quota */ }
  }

  get(): string[] { return this._terms; }

  add(term: string): string[] {
    const trimmed = term.trim();
    if (!trimmed) return this._terms;
    this._terms = [trimmed, ...this._terms.filter(s => s.toLowerCase() !== trimmed.toLowerCase())].slice(0, MAX_ENTRIES);
    this._persist();
    return this._terms;
  }

  remove(term: string): string[] {
    this._terms = this._terms.filter(s => s !== term);
    this._persist();
    return this._terms;
  }

  clear(): string[] {
    this._terms = [];
    this._persist();
    return this._terms;
  }

  private _persist(): void {
    try {
      if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, JSON.stringify(this._terms));
    } catch { /* quota exceeded */ }
  }
}
