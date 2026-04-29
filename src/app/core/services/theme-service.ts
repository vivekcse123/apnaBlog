import { Injectable, signal, effect, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

export type Theme    = 'light' | 'dark';
export type Language = 'en' | 'hi' | 'te' | 'ta' | 'bn' | 'mr';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private platformId = inject(PLATFORM_ID);
  private isBrowser  = isPlatformBrowser(this.platformId);
  private userId: string | null = null;

  theme = signal<Theme>('light');
  language = signal<Language>('en');

  constructor() {
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

    this.theme.set(savedTheme ?? 'light');
    this.language.set(savedLang ?? 'en');

    document.documentElement.setAttribute('data-theme', this.theme());
  }

  toggleTheme(): void {
    this.theme.set(this.theme() === 'light' ? 'dark' : 'light');
  }

  setLanguage(lang: Language): void {
    this.language.set(lang);
  }
}
