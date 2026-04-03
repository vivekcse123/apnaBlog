import { CommonModule } from '@angular/common';
import { Component, ElementRef, EventEmitter, Input, Output, HostListener } from '@angular/core';

@Component({
  selector: 'app-user-profile',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './user-profile.html',
  styleUrl: './user-profile.css',
})
export class UserProfile {

  constructor(private elRef: ElementRef){}
  @Input() name!: string;
  @Input() role!: string;
  @Input() email!: string;

  @Output() close = new EventEmitter<void>();

  closeProfile(event: Event){
    event.stopPropagation();
    this.close.emit();
  }

  @HostListener('document:click', ['$event']) onClickOutside(event: Event) {
    if (!this.elRef.nativeElement.contains(event.target)) {
      this.close.emit();
    }
  }

}
