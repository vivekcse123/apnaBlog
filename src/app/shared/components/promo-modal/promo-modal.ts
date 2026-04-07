import { Component, EventEmitter, Input, Output, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-promo-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './promo-modal.html',
  styleUrl: './promo-modal.css',
  encapsulation: ViewEncapsulation.None
})
export class PromoModal {
  @Input() isOpen: boolean = false;
  @Output() close = new EventEmitter<void>();

  closeModal(event?: Event) {
    event?.stopPropagation();
    this.close.emit();
  }
}