import { CommonModule, isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy, Component, ElementRef, HostListener, PLATFORM_ID,
  ViewChild, effect, inject, input, output
} from '@angular/core';

@Component({
  selector: 'app-confirm-modal',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  templateUrl: './confirm-modal.html',
  styleUrl: './confirm-modal.css',
})
export class ConfirmModal {
  private platformId = inject(PLATFORM_ID);
  private previouslyFocused: HTMLElement | null = null;

  @ViewChild('confirmBtn') confirmBtn?: ElementRef<HTMLButtonElement>;

  show        = input<boolean>(false);
  title       = input<string>('Are you sure?');
  message     = input<string>('');
  confirmText = input<string>('Confirm');
  cancelText  = input<string>('Cancel');
  danger      = input<boolean>(true);

  confirmed = output<void>();
  cancelled = output<void>();

  constructor() {
    effect(() => {
      if (!isPlatformBrowser(this.platformId)) return;
      if (this.show()) {
        this.previouslyFocused = document.activeElement as HTMLElement;
        queueMicrotask(() => this.confirmBtn?.nativeElement?.focus());
      } else if (this.previouslyFocused) {
        this.previouslyFocused.focus();
        this.previouslyFocused = null;
      }
    });
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.show()) this.cancel();
  }

  confirm(): void {
    this.confirmed.emit();
  }

  cancel(): void {
    this.cancelled.emit();
  }
}
