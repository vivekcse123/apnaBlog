import { CommonModule } from '@angular/common';
import { Component, ElementRef, EventEmitter, Input, Output, HostListener } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormatCountPipe } from '../pipes/format-count-pipe';

interface NavItem { label: string; route: string[]; icon: string; }

@Component({
  selector: 'app-user-profile',
  standalone: true,
  imports: [CommonModule, RouterLink, FormatCountPipe],
  templateUrl: './user-profile.html',
  styleUrl: './user-profile.css',
})
export class UserProfile {
  constructor(private elRef: ElementRef) {}

  @Input() name!:        string;
  @Input() role!:        string;
  @Input() email!:       string;
  @Input() avatar:       string | null = null;
  @Input() userId:       string = '';
  @Input() basePath:     string = 'user';
  @Input() totalBlogs:   number = 0;
  @Input() totalViews:   number = 0;

  @Output() close  = new EventEmitter<void>();
  @Output() logout = new EventEmitter<void>();

  get roleLabel(): string {
    if (this.role === 'super_admin') return 'Super Admin';
    if (this.role === 'admin')       return 'Admin';
    return 'User';
  }

  get navItems(): NavItem[] {
    const b  = this.basePath;
    const id = this.userId;

    if (b === 'admin') {
      return [
        { label: 'Create Blog',      route: [`/${b}`, id, 'create-blog'],   icon: 'write'    },
        { label: 'Create User',      route: [`/${b}`, id, 'create-user'],   icon: 'add-user' },
        { label: 'Visitor Analytics',route: [`/${b}`, id, 'visitor'],       icon: 'chart'    },
        { label: 'Account Settings', route: [`/${b}`, id, 'settings'],      icon: 'settings' },
      ];
    }

    if (b === 'super-admin') {
      return [
        { label: 'Role Management',  route: [`/${b}`, id, 'role-management'], icon: 'shield'   },
        { label: 'Visitor Analytics',route: [`/${b}`, id, 'visitor'],         icon: 'chart'    },
        { label: 'Account Settings', route: [`/${b}`, id, 'settings'],        icon: 'settings' },
      ];
    }

    return [
      { label: 'Write a Story',   route: ['/user', id, 'manage-blogs'],  icon: 'write'    },
      { label: 'My Overview',     route: ['/user', id],                  icon: 'chart'    },
      { label: 'Account Settings',route: ['/user', id, 'settings'],      icon: 'settings' },
      { label: 'Public Site',     route: ['/welcome'],                   icon: 'globe'    },
    ];
  }

  closeProfile(event: Event): void {
    event.stopPropagation();
    this.close.emit();
  }

  onLogout(event: Event): void {
    event.stopPropagation();
    this.logout.emit();
    this.close.emit();
  }

  @HostListener('document:click', ['$event'])
  onClickOutside(event: Event): void {
    if (!this.elRef.nativeElement.contains(event.target)) {
      this.close.emit();
    }
  }
}
