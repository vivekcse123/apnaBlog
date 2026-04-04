// common-header.ts  (updated)
import { Component, EventEmitter, Input, OnInit, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { NotificationPanel } from '../components/notification-panel/notification-panel';
import { NotificationService } from '../../core/services/notification-service';

@Component({
  selector: 'app-common-header',
  standalone: true,
  imports: [
    RouterLink, CommonModule, RouterLinkActive,
    MatIconModule,
    NotificationPanel,   // ← added
  ],
  templateUrl: './common-header.html',
  styleUrls: ['./common-header.css'],
})
export class CommonHeader implements OnInit {

  @Input() logo:    string        = 'ApnaBlogs';
  @Input() profile: string | null = '';
  @Input() navs:    { label: string; routerLink: string }[] = [];
  @Output() open = new EventEmitter<void>();

  menuOpen = false;

  private notifSvc = inject(NotificationService);

  ngOnInit(): void {
    //this.notifSvc.startPolling(); 
  }

  toggleMenu():                 void { this.menuOpen = !this.menuOpen; }
  openProfile(e: Event):        void { e.stopPropagation(); this.open.emit(); }
}