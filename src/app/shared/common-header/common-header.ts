import { Component, EventEmitter, Input, OnInit, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { NotificationPanel } from '../components/notification-panel/notification-panel';
import { NotificationService } from '../../core/services/notification-service';
import { ThemeService } from '../../core/services/theme-service';

@Component({
  selector: 'app-common-header',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, CommonModule, MatIconModule, NotificationPanel],
  templateUrl: './common-header.html',
  styleUrls: ['./common-header.css'],
})
export class CommonHeader implements OnInit {
  @Input() logo:          string = 'ApnaInsights';
  @Input() profile:       string | null = '';   // avatar initials (e.g. "VK")
  @Input() name:          string | null = null; // full display name
  @Input() avatarUrl:     string | null = null;
  @Input() userRole:      string | null = null;
  @Input() navs:          { label: string; routerLink: string }[] = [];
  @Input() set panelOpen(v: boolean) { this.profileOpen = v; }
  @Output() open = new EventEmitter<void>();

  get displayName(): string { return this.name || this.profile || ''; }

  menuOpen    = false;
  profileOpen = false;

  private notifSvc = inject(NotificationService);
  themeService     = inject(ThemeService);

  ngOnInit(): void {}

  getRoleLabel(): string {
    if (this.userRole === 'super_admin') return 'Super Admin';
    if (this.userRole === 'admin')       return 'Admin';
    return 'User';
  }

  getRoleIcon(): string {
    if (this.userRole === 'super_admin') return '★';
    if (this.userRole === 'admin')       return '⚡';
    return '●';
  }

  toggleMenu(): void { this.menuOpen = !this.menuOpen; }

  openProfile(e: Event): void {
    e.stopPropagation();
    this.profileOpen = !this.profileOpen;
    this.open.emit();
  }
}