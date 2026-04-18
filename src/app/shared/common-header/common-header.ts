import { Component, EventEmitter, Input, OnInit, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { NotificationPanel } from '../components/notification-panel/notification-panel';
import { NotificationService } from '../../core/services/notification-service';

@Component({
  selector: 'app-common-header',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, CommonModule, MatIconModule, NotificationPanel],
  templateUrl: './common-header.html',
  styleUrls: ['./common-header.css'],
})
export class CommonHeader implements OnInit {
  @Input() logo:      string = 'ApnaInsights';
  @Input() profile:   string | null = '';
  @Input() avatarUrl: string | null = null;
  @Input() userRole:  string | null = null;
  @Input() navs:      { label: string; routerLink: string }[] = [];
  @Output() open = new EventEmitter<void>();

  getRoleLabel(): string {
    if (this.userRole === 'super_admin') return 'Super Admin';
    if (this.userRole === 'admin')       return 'Admin';
    return 'User';
  }

  menuOpen = false;

  private notifSvc = inject(NotificationService);

  ngOnInit(): void {}

  toggleMenu():          void { this.menuOpen = !this.menuOpen; }
  openProfile(e: Event): void { e.stopPropagation(); this.open.emit(); }
}