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
    return 'Writer';
  }

  get navItems(): NavItem[] {
    const b = this.basePath;
    const id = this.userId;

    if (b === 'admin') {
      return [
        { label: 'Dashboard',    route: [`/${b}`, id],                   icon: 'home'     },
        { label: 'Manage Blogs', route: [`/${b}`, id, 'manage-blogs'],   icon: 'docs'     },
        { label: 'Manage Users', route: [`/${b}`, id, 'manage-users'],   icon: 'users'    },
        { label: 'Settings',     route: [`/${b}`, id, 'settings'],       icon: 'settings' },
      ];
    }

    if (b === 'super-admin') {
      return [
        { label: 'Dashboard',       route: [`/${b}`, id],                      icon: 'home'    },
        { label: 'Manage Blogs',    route: [`/${b}`, id, 'manage-blogs'],      icon: 'docs'    },
        { label: 'Manage Users',    route: [`/${b}`, id, 'manage-users'],      icon: 'users'   },
        { label: 'Role Management', route: [`/${b}`, id, 'role-management'],   icon: 'shield'  },
        { label: 'Settings',        route: [`/${b}`, id, 'settings'],          icon: 'settings'},
      ];
    }

    return [
      { label: 'Dashboard',  route: ['/user', id],                  icon: 'home'     },
      { label: 'My Stories', route: ['/user', id, 'manage-blogs'],  icon: 'docs'     },
      { label: 'Explore',    route: ['/user', id, 'explore-blogs'], icon: 'search'   },
      { label: 'Settings',   route: ['/user', id, 'settings'],      icon: 'settings' },
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
