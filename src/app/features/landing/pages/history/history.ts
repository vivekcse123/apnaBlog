import {
  Component, inject, signal, OnInit,
  ChangeDetectionStrategy, PLATFORM_ID,
} from '@angular/core';
import { isPlatformBrowser, CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Meta, Title } from '@angular/platform-browser';
import { ReadingHistory, HistoryEntry } from '../../../../core/services/reading-history';
import { MobileBottomNav } from '../../../../shared/mobile-bottom-nav/mobile-bottom-nav';
@Component({
  selector: 'app-history',
  standalone: true,
  imports: [CommonModule, RouterLink, MobileBottomNav],
  templateUrl: './history.html',
  styleUrl: './history.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HistoryPage implements OnInit {
  private readingHistory = inject(ReadingHistory);
  private platformId     = inject(PLATFORM_ID);
  private title          = inject(Title);
  private meta           = inject(Meta);

  entries   = signal<HistoryEntry[]>([]);
  isLoaded  = signal(false);
  showClear = signal(false);

  ngOnInit(): void {
    this.title.setTitle('Reading History — ApnaInsights');
    this.meta.updateTag({ name: 'robots', content: 'noindex, nofollow' });
    this.meta.updateTag({ name: 'description', content: 'Your personal reading history on ApnaInsights.' });

    if (isPlatformBrowser(this.platformId)) {
      this.entries.set(this.readingHistory.getEntries());
      this.isLoaded.set(true);
    }
  }

  remove(id: string): void {
    this.readingHistory.remove(id);
    this.entries.set(this.readingHistory.getEntries());
  }

  clearAll(): void {
    this.readingHistory.clear();
    this.entries.set([]);
    this.showClear.set(false);
  }

  trackById(_: number, e: HistoryEntry): string { return e.id; }
}
