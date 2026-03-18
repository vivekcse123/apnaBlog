import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-common-header',
  standalone: true,
  imports: [RouterLink, CommonModule, RouterLinkActive, MatIconModule],
  templateUrl: './common-header.html',
  styleUrls: ['./common-header.css']
})
export class CommonHeader {

  @Input() logo: string = 'ApnaBlog';
  @Input() profile: string | null = '';
  @Input() navs: { label: string; routerLink: string }[] = [];

  @Output() open = new EventEmitter<void>();

  menuOpen: boolean = false;

  toggleMenu(): void {
    this.menuOpen = !this.menuOpen;
  }

  openProfile(event: Event): void {
    event.stopPropagation();
    this.open.emit();
  }

}