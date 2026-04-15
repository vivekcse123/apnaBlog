import {
  Directive, Output, EventEmitter, OnInit, OnDestroy,
  ElementRef, Input, PLATFORM_ID, inject,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

/**
 * InfiniteScroll directive — fires `scrolled` when the host element
 * enters the bottom 10% of the viewport (configurable via `threshold`).
 *
 * Usage:
 *   <div appInfiniteScroll (scrolled)="loadMore()" [disabled]="!hasMore"></div>
 */
@Directive({
  selector: '[appInfiniteScroll]',
  standalone: true,
})
export class InfiniteScrollDirective implements OnInit, OnDestroy {
  @Input() threshold  = 0.1;   // 10 % visible triggers load
  @Input() disabled   = false;

  @Output() scrolled = new EventEmitter<void>();

  private observer!: IntersectionObserver;
  private el        = inject(ElementRef);
  private platformId = inject(PLATFORM_ID);

  ngOnInit(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    this.observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !this.disabled) {
          this.scrolled.emit();
        }
      },
      { threshold: this.threshold }
    );
    this.observer.observe(this.el.nativeElement);
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
  }
}
