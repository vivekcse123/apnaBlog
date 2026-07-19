import { CommonModule, isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy, Component, DestroyRef, ElementRef, PLATFORM_ID, ViewChild,
  inject, signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NavigationStart, Router, RouterModule } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs/operators';
import { AiAssistantService, AssistantChip, AssistantResult } from './ai-assistant.service';

interface ChatMessage {
  from:     'user' | 'bot';
  text?:    string;
  results?: AssistantResult[];
  chips?:   AssistantChip[];
}

const HIDDEN_ROUTE_PREFIXES = ['/auth', '/admin', '/super-admin'];

@Component({
  selector: 'app-ai-assistant',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './ai-assistant.html',
  styleUrl: './ai-assistant.css',
})
export class AiAssistant {
  private assistant  = inject(AiAssistantService);
  private router     = inject(Router);
  private destroyRef  = inject(DestroyRef);
  private platformId = inject(PLATFORM_ID);

  @ViewChild('scrollEl') scrollEl!: ElementRef<HTMLDivElement>;

  isOpen    = signal(false);
  isHidden  = signal(false);
  query     = signal('');
  isTyping  = signal(false);
  messages  = signal<ChatMessage[]>([]);

  constructor() {
    this.updateHiddenForUrl(this.router.url);
    this.router.events
      .pipe(filter((e): e is NavigationStart => e instanceof NavigationStart), takeUntilDestroyed(this.destroyRef))
      .subscribe(e => this.updateHiddenForUrl(e.url));
  }

  private updateHiddenForUrl(url: string): void {
    this.isHidden.set(HIDDEN_ROUTE_PREFIXES.some(p => url.startsWith(p)));
  }

  toggle(): void {
    this.isOpen.update(v => !v);
    if (this.isOpen()) {
      if (isPlatformBrowser(this.platformId)) document.body.style.overflow = 'hidden';
      if (this.messages().length === 0) {
        this.assistant.ensureLoaded().subscribe(() => {
          const reply = this.assistant.greeting();
          this.messages.set([{ from: 'bot', text: reply.text, chips: reply.chips }]);
        });
      }
    } else if (isPlatformBrowser(this.platformId)) {
      document.body.style.overflow = '';
    }
  }

  close(): void {
    this.isOpen.set(false);
    if (isPlatformBrowser(this.platformId)) document.body.style.overflow = '';
  }

  clearChat(): void {
    this.isTyping.set(false);
    this.query.set('');
    this.assistant.ensureLoaded().subscribe(() => {
      const reply = this.assistant.greeting();
      this.messages.set([{ from: 'bot', text: reply.text, chips: reply.chips }]);
    });
  }

  submit(): void {
    const text = this.query().trim();
    if (!text) return;
    this.sendQuery(text);
    this.query.set('');
  }

  onChipClick(chip: AssistantChip): void {
    if (chip.query.startsWith('__category__')) {
      const name = chip.query.replace('__category__', '');
      this.close();
      this.assistant.navigateToCategory(name);
      return;
    }
    this.sendQuery(chip.query, chip.label);
  }

  onResultClick(result: AssistantResult): void {
    this.close();
    this.assistant.navigateToPost(result);
  }

  private sendQuery(rawQuery: string, displayText?: string): void {
    this.messages.update(m => [...m, { from: 'user', text: displayText ?? rawQuery }]);
    this.isTyping.set(true);
    this.scrollToBottom();

    this.assistant.ensureLoaded().subscribe(() => {
      // A short, deliberate delay makes the reply feel considered rather
      // than an instant lookup table hit — purely a UX pacing choice.
      setTimeout(() => {
        const reply = this.assistant.ask(rawQuery);
        this.isTyping.set(false);
        this.messages.update(m => [...m, { from: 'bot', text: reply.text, results: reply.results, chips: reply.chips }]);
        this.scrollToBottom();
      }, 350);
    });
  }

  private scrollToBottom(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    setTimeout(() => {
      const el = this.scrollEl?.nativeElement;
      if (el) el.scrollTop = el.scrollHeight;
    }, 30);
  }

  formatViews(views: number): string | null {
    return views >= 100 ? `${views.toLocaleString('en-IN')} views` : null;
  }
}
