import { Component, EventEmitter, HostListener, Input, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { ThemeService } from '../../core/services/theme-service';

export interface SidebarLink {
  label: string;
  routerLink: string;
  icon: string;
  exact?: boolean;
}

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive],
  templateUrl: './sidebar.html',
  styleUrl: './sidebar.css',
})
export class Sidebar {
  @Input() navLinks:  SidebarLink[] = [];
  @Input() shortcuts: SidebarLink[] = [];
  @Input() userName:  string = '';
  @Input() userRole:  string = '';
  @Input() avatarUrl: string | null = null;
  @Input() initial:   string = '';
  @Input() isOpen:    boolean = false;

  @Output() logout       = new EventEmitter<void>();
  @Output() close        = new EventEmitter<void>();
  @Output() profileClick = new EventEmitter<void>();

  themeService = inject(ThemeService);
  showUserMenu = false;

  get firstName(): string { return this.userName.split(' ')[0]; }

  get roleLabel(): string {
    if (this.userRole === 'super_admin') return 'Super Admin';
    if (this.userRole === 'admin') return 'Admin';
    return 'User';
  }

  get settingsRoute(): string {
    return this.navLinks.find(n => n.routerLink.includes('settings'))?.routerLink ?? '/';
  }

  onNavClick(): void { this.close.emit(); }

  onProfileClick(): void {
    this.showUserMenu = false;
    this.profileClick.emit();
  }

  toggleUserMenu(e: Event): void {
    e.stopPropagation();
    this.showUserMenu = !this.showUserMenu;
  }

  onLogout(): void {
    this.showUserMenu = false;
    this.logout.emit();
  }

  @HostListener('document:click')
  onOutsideClick(): void { this.showUserMenu = false; }
}
