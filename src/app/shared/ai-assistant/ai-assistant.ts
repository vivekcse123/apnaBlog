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

// Shorts is an immersive full-bleed feed with its own upload FAB pinned to
// the same bottom-right corner (and that FAB's offset shifts further when an
// ad banner fills in), so the AI FAB can't be reliably "raised" to clear it -
// simplest to hide it there entirely.
// '/user' and '/sponsor' are private dashboard-only prefixes (no public route
// shares them). '/career-guides/dashboard' must be the full literal, NOT the
// bare '/career-guides' prefix - that's a public prefix shared by the mentor
// marketplace/explore/profile pages, which should keep showing the assistant.
const HIDDEN_ROUTE_PREFIXES = ['/auth', '/admin', '/super-admin', '/shorts', '/user', '/career-guides/dashboard', '/sponsor'];

// Blog-detail stacks its own fixed Like/Comment/Share/Save bar above the
// mobile bottom nav - the FAB needs extra bottom clearance there so it
// doesn't sit on top of the Save button.
const RAISED_ROUTE_PREFIXES = ['/blog/'];

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
  isRaised  = signal(false);
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
    this.isRaised.set(RAISED_ROUTE_PREFIXES.some(p => url.startsWith(p)));
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
