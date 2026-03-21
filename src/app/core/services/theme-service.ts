import { Injectable, signal, effect, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

export type Theme = 'light' | 'dark';
export type Language = 'en' | 'hi' | 'te' | 'ta' | 'bn' | 'mr';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private platformId = inject(PLATFORM_ID);
  private isBrowser  = isPlatformBrowser(this.platformId);

  theme = signal<Theme>(
    (this.isBrowser ? localStorage.getItem('app-theme') as Theme : null) ?? 'light'
  );

  language = signal<Language>(
    (this.isBrowser ? localStorage.getItem('app-lang') as Language : null) ?? 'en'
  );

  constructor() {
    // Apply immediately on boot
    if (this.isBrowser) {
      document.documentElement.setAttribute('data-theme', this.theme());
    }

    // Re-apply on every theme change → affects ENTIRE app via [data-theme] on <html>
    effect(() => {
      const t = this.theme();
      if (this.isBrowser) {
        document.documentElement.setAttribute('data-theme', t);
        localStorage.setItem('app-theme', t);
      }
    });

    effect(() => {
      if (this.isBrowser) {
        localStorage.setItem('app-lang', this.language());
      }
    });
  }

  toggleTheme(): void {
    this.theme.set(this.theme() === 'light' ? 'dark' : 'light');
  }

  setLanguage(lang: Language): void {
    this.language.set(lang);
  }
}