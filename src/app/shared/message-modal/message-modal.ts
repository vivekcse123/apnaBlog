import { CommonModule } from '@angular/common';
import { Component, input, output } from '@angular/core';

@Component({
  selector: 'app-message-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './message-modal.html',
  styleUrl: './message-modal.css',
})
export class MessageModal {

  show = input<boolean>(false);
  type = input<'success' | 'error'>('success');
  title = input<string>('');
  message = input<string>('');

  closed = output<void>();

  close() {
    this.closed.emit();
  }
}