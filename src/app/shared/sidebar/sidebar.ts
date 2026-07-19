import {
  ChangeDetectionStrategy, Component, EventEmitter, Input, Output, inject
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { ThemeService } from '../../core/services/theme-service';

export interface SidebarLink {
  label: string;
  routerLink: string;
  icon: string;
  exact?: boolean;
  /** When set, a section label is rendered above this link whenever it
   *  differs from the previous link's groupLabel - lets callers organize
   *  navLinks into visually grouped sections (e.g. "CONTENT" / "INBOX")
   *  without the sidebar needing a separate grouped-input shape. */
  groupLabel?: string;
  /** Small pill rendered after the label, e.g. an unread count or a role tag. */
  badge?: string;
}

@Component({
  selector: 'app-sidebar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterLink, RouterLinkActive],
  templateUrl: './sidebar.html',
  styleUrl: './sidebar.css',
})
export class Sidebar {
  @Input() navLinks:  SidebarLink[] = [];
  @Input() shortcuts: SidebarLink[] = [];
  @Input() isOpen:    boolean = false;

  @Output() close = new EventEmitter<void>();

  themeService = inject(ThemeService);

  isNewGroup(index: number): boolean {
    const link = this.navLinks[index];
    if (!link.groupLabel) return false;
    const prev = this.navLinks[index - 1];
    return !prev || prev.groupLabel !== link.groupLabel;
  }

  onNavClick(): void { this.close.emit(); }
}
