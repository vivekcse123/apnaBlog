import { CommonModule, isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy, Component, ElementRef, HostListener, PLATFORM_ID,
  ViewChild, effect, inject, input, output
} from '@angular/core';

@Component({
  selector: 'app-message-modal',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  templateUrl: './message-modal.html',
  styleUrl: './message-modal.css',
})
export class MessageModal {
  private platformId = inject(PLATFORM_ID);
  private previouslyFocused: HTMLElement | null = null;

  @ViewChild('okBtn') okBtn?: ElementRef<HTMLButtonElement>;

  show = input<boolean>(false);
  type = input<'success' | 'error'>('success');
  title = input<string>('');
  message = input<string>('');

  closed = output<void>();

  constructor() {
    // Move focus into the dialog on open, restore it to the trigger on close -
    // otherwise keyboard/screen-reader users have no indication a dialog opened.
    effect(() => {
      if (!isPlatformBrowser(this.platformId)) return;
      if (this.show()) {
        this.previouslyFocused = document.activeElement as HTMLElement;
        queueMicrotask(() => this.okBtn?.nativeElement?.focus());
      } else if (this.previouslyFocused) {
        this.previouslyFocused.focus();
        this.previouslyFocused = null;
      }
    });
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.show()) this.close();
  }

  close() {
    this.closed.emit();
  }
}