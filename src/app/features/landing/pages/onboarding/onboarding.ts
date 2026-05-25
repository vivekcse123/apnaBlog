import {
  Component, signal, computed, inject, PLATFORM_ID, ChangeDetectionStrategy
} from '@angular/core';
import { isPlatformBrowser, CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';

interface Slide {
  id:       number;
  emoji:    string;
  title:    string;
  subtitle: string;
  accent:   string;
  bg:       string;
  features: string[];
}

@Component({
  selector: 'app-onboarding',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './onboarding.html',
  styleUrl:    './onboarding.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Onboarding {
  private router     = inject(Router);
  private platformId = inject(PLATFORM_ID);

  current = signal(0);

  slides: Slide[] = [
    {
      id: 0,
      emoji: '📖',
      title: 'Real Stories from Real People',
      subtitle: 'Discover authentic blogs written by everyday people across India and the world.',
      accent: '#43cea2',
      bg: 'linear-gradient(160deg, #071e42 0%, #0d4a36 100%)',
      features: ['14+ topics to explore', '2,400+ published stories', 'Updated daily'],
    },
    {
      id: 1,
      emoji: '🌏',
      title: 'Every Topic Under the Sun',
      subtitle: 'Technology, Health, Village Life, Sports, Cooking — stories that match your world.',
      accent: '#5b8dee',
      bg: 'linear-gradient(160deg, #0c1a3a 0%, #1a2d6e 100%)',
      features: ['14 unique categories', 'Personalized for you', 'Smart recommendations'],
    },
    {
      id: 2,
      emoji: '✍️',
      title: 'Your Voice Belongs Here',
      subtitle: 'Write and publish your own stories for free. No gatekeepers, no paywalls.',
      accent: '#f59e0b',
      bg: 'linear-gradient(160deg, #1a0a00 0%, #3d1f00 100%)',
      features: ['Free forever', 'Rich text editor', 'Instant publishing'],
    },
    {
      id: 3,
      emoji: '🔔',
      title: 'Stay in the Loop',
      subtitle: 'Get notified about new stories, trending topics, and writers you follow.',
      accent: '#ec4899',
      bg: 'linear-gradient(160deg, #1a0020 0%, #3d004a 100%)',
      features: ['Push notifications', 'Bookmarks & history', 'Offline reading'],
    },
  ];

  isLast = computed(() => this.current() === this.slides.length - 1);

  next(): void {
    if (this.isLast()) { this.finish(); return; }
    this.current.update(c => c + 1);
  }

  goTo(i: number): void { this.current.set(i); }

  finish(): void {
    if (isPlatformBrowser(this.platformId)) {
      localStorage.setItem('apna_onboarded', '1');
    }
    this.router.navigate(['/'], { replaceUrl: true });
  }

  /* Touch/swipe support */
  private touchStartX = 0;
  onTouchStart(e: TouchEvent): void { this.touchStartX = e.touches[0].clientX; }
  onTouchEnd(e: TouchEvent): void {
    const dx = e.changedTouches[0].clientX - this.touchStartX;
    if (dx < -50 && !this.isLast()) this.current.update(c => c + 1);
    if (dx > 50 && this.current() > 0) this.current.update(c => c - 1);
  }
}
