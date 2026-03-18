import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'app-user-profile',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './user-profile.html',
  styleUrl: './user-profile.css',
})
export class UserProfile {
  @Input() name!: string;
  @Input() role!: string;
  @Input() email!: string;

  @Output() close = new EventEmitter<void>();

  closeProfile(event: Event){
    event.stopPropagation();
    this.close.emit();
  }

}
