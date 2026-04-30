import { Injectable, signal, effect, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

export type Theme    = 'light' | 'dark';
export type Language = 'en' | 'hi' | 'te' | 'ta' | 'bn' | 'mr';

const NIGHT_START = 18; // 6 PM → dark
const NIGHT_END   = 6;  // 6 AM → light

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private platformId = inject(PLATFORM_ID);
  private isBrowser  = isPlatformBrowser(this.platformId);
  private userId: string | null = null;

  private autoTimer:       ReturnType<typeof setInterval> | null = null;
  private lastCheckedHour  = -1;

  theme    = signal<Theme>('light');
  language = signal<Language>('en');

  constructor() {
    if (this.isBrowser) {
      // For guest users: restore saved preference or fall back to time-based default
      const saved   = localStorage.getItem('app-theme') as Theme | null;
      const initial = saved ?? (this.isNightTime() ? 'dark' : 'light');
      this.theme.set(initial);
      document.documentElement.setAttribute('data-theme', initial);
      this.startAutoTheme();
    }

    effect(() => {
      const t = this.theme();
      if (this.isBrowser) {
        document.documentElement.setAttribute('data-theme', t);
        const key = this.userId ? `theme_${this.userId}` : 'app-theme';
        localStorage.setItem(key, t);
      }
    });

    effect(() => {
      const l = this.language();
      if (this.isBrowser) {
        const key = this.userId ? `lang_${this.userId}` : 'app-lang';
        localStorage.setItem(key, l);
      }
    });
  }

  init(userId: string): void {
    this.userId = userId;
    if (!this.isBrowser) return;

    const savedTheme = localStorage.getItem(`theme_${userId}`) as Theme | null;
    const savedLang  = localStorage.getItem(`lang_${userId}`)  as Language | null;

    // Use saved preference; fall back to time-based default instead of always 'light'
    this.theme.set(savedTheme ?? (this.isNightTime() ? 'dark' : 'light'));
    this.language.set(savedLang ?? 'en');
    document.documentElement.setAttribute('data-theme', this.theme());
  }

  toggleTheme(): void {
    this.theme.set(this.theme() === 'light' ? 'dark' : 'light');
  }

  setLanguage(lang: Language): void {
    this.language.set(lang);
  }

  private isNightTime(): boolean {
    const h = new Date().getHours();
    return h >= NIGHT_START || h < NIGHT_END;
  }

  /**
   * Checks the hour every minute. When the hour crosses 18 (6 PM) it switches
   * to dark; when it crosses 6 (6 AM) it switches back to light.
   * Called once — the timer persists for the lifetime of the service.
   */
  private startAutoTheme(): void {
    if (!this.isBrowser || this.autoTimer !== null) return;
    this.lastCheckedHour = new Date().getHours();

    this.autoTimer = setInterval(() => {
      const h = new Date().getHours();
      if (h === this.lastCheckedHour) return;
      this.lastCheckedHour = h;

      if (h === NIGHT_START) this.theme.set('dark');
      else if (h === NIGHT_END) this.theme.set('light');
    }, 60_000);
  }
}
