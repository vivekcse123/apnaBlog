import { Component, inject, signal, computed, OnInit, DestroyRef } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Auth } from '../../../../core/services/auth';
import { UserService } from '../../../user/services/user-service';
import { ThemeService, Language } from '../../../../core/services/theme-service';
import { User } from '../../../user/models/user.mode';

type NotifKey = 'newPosts' | 'comments' | 'likes' | 'newUsers' | 'weeklyDigest' | 'security';

interface NotifState {
  newPosts:     boolean;
  comments:     boolean;
  likes:        boolean;
  newUsers:     boolean;
  weeklyDigest: boolean;
  security:     boolean;
}

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, FormsModule, DatePipe],
  templateUrl: './settings.html',
  styleUrl:    './settings.css',
})
export class Settings implements OnInit {
  private authService = inject(Auth);
  private userService = inject(UserService);
  private destroyRef  = inject(DestroyRef);
  private route       = inject(ActivatedRoute);
  private router      = inject(Router);
  themeService        = inject(ThemeService);

  activeSection = signal<string>('profile');

  sections = [
    { id: 'profile',       label: 'Profile',       icon: '◈' },
    { id: 'appearance',    label: 'Appearance',    icon: '◐' },
    { id: 'language',      label: 'Language',      icon: '◎' },
    { id: 'notifications', label: 'Notifications', icon: '◆' },
    { id: 'security',      label: 'Security',      icon: '◉' },
    { id: 'danger',        label: 'Danger Zone',   icon: '◬' },
  ];

  isLoading      = signal(true);
  isEditing      = signal(false);
  isSaving       = signal(false);
  successMessage = signal('');
  errorMessage   = signal('');
  saveSuccess    = signal(false);
  saveError      = signal('');

  user   = signal<User | null>(null);
  userId = signal<string | null>(null);

  editForm: Partial<User> = {};

  avatarInitial = computed(() =>
    this.user()?.name?.charAt(0).toUpperCase() ?? 'A'
  );

  notifications = signal<NotifState>({
    newPosts:     true,
    comments:     true,
    likes:        false,
    newUsers:     true,
    weeklyDigest: true,
    security:     true,
  });

  notifItems: { key: NotifKey; label: string; desc: string }[] = [
    { key: 'newPosts',     label: 'New post published',     desc: 'When any user publishes a blog'      },
    { key: 'comments',     label: 'New comments',           desc: 'When readers comment on posts'       },
    { key: 'likes',        label: 'Likes & reactions',      desc: 'Engagement on posts'                 },
    { key: 'newUsers',     label: 'New user registrations', desc: 'When someone signs up'               },
    { key: 'weeklyDigest', label: 'Weekly digest',          desc: 'Summary every Monday morning'        },
    { key: 'security',     label: 'Security alerts',        desc: 'Login attempts, suspicious activity' },
  ];

  languages: { code: Language; label: string; native: string; flag: string }[] = [
    { code: 'en', label: 'English', native: 'English', flag: '🇬🇧' },
    { code: 'hi', label: 'Hindi',   native: 'हिन्दी',   flag: '🇮🇳' },
    { code: 'te', label: 'Telugu',  native: 'తెలుగు',   flag: '🇮🇳' },
    { code: 'ta', label: 'Tamil',   native: 'தமிழ்',    flag: '🇮🇳' },
    { code: 'bn', label: 'Bengali', native: 'বাংলা',    flag: '🇧🇩' },
    { code: 'mr', label: 'Marathi', native: 'मराठी',    flag: '🇮🇳' },
  ];

  twoFactor    = signal(false);
  showSessions = signal(false);
  showPassword = signal(false);
  passwordForm = { currentPassword: '', newPassword: '', confirm: '' };

  sessions = [
    { device: 'Chrome · Windows 11',   location: 'Hyderabad, IN', time: 'Now',         current: true  },
    { device: 'Safari · iPhone 15',    location: 'Mumbai, IN',    time: '2 hours ago', current: false },
    { device: 'Firefox · MacBook Pro', location: 'Bangalore, IN', time: 'Yesterday',   current: false },
  ];

  showDeleteConfirm = signal(false);
  deleteInput = '';

  ngOnInit(): void {
    const paramId = this.route.parent?.snapshot.paramMap.get('id');
    const authId  = this.authService.userId();
    const id      = paramId ?? authId;

    this.userId.set(id);

    if (!id) {
      this.isLoading.set(false);
      return;
    }

    this.themeService.init(id);

    this.loadUser(id);
  }

  private loadUser(id: string): void {
    this.userService.getUserById(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.user.set(res.data);
          this.isLoading.set(false);
        },
        error: (err) => {
          console.error('Failed to load user:', err);
          this.isLoading.set(false);
        },
      });
  }

  startEdit(): void {
    this.editForm = { ...this.user() };
    this.isEditing.set(true);
    this.saveError.set('');
  }

  cancelEdit(): void {
    this.isEditing.set(false);
    this.editForm = {};
  }

  saveProfile(): void {
    const id = this.userId();
    if (!id) return;

    this.isSaving.set(true);
    this.saveError.set('');

    const payload = {
      name:     this.editForm.name,
      email:    this.editForm.email,
      dob:      this.editForm.dob,
      location: this.editForm.location,
      role:     this.editForm.role?.toLowerCase(),
    };

    this.userService.updateUser(id, payload)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.user.set(res.data);
          this.isSaving.set(false);
          this.isEditing.set(false);
          this.saveSuccess.set(true);
          const t = setTimeout(() => this.saveSuccess.set(false), 3000);
          this.destroyRef.onDestroy(() => clearTimeout(t));
        },
        error: (err) => {
          this.isSaving.set(false);
          this.saveError.set(err?.error?.message ?? 'Failed to save. Try again.');
        },
      });
  }

  toggleNotif(key: NotifKey): void {
    this.notifications.update(n => ({ ...n, [key]: !n[key] }));
  }

  isNotifOn(key: NotifKey): boolean {
    return this.notifications()[key];
  }

  updatePassword(): void {
    const { currentPassword, newPassword, confirm } = this.passwordForm;

    if (!currentPassword || !newPassword) {
      this.errorMessage.set('Please fill in all password fields.');
      return;
    }

    if (newPassword !== confirm) {
      this.errorMessage.set('New password and confirm password do not match.');
      return;
    }

    if (newPassword.length < 8) {
      this.errorMessage.set('New password must be at least 8 characters.');
      return;
    }

    const id = this.userId();
    if (!id) return;

    this.authService.changePassword(id, currentPassword, newPassword)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.errorMessage.set('');
          this.successMessage.set(res.message);
          this.passwordForm = { currentPassword: '', newPassword: '', confirm: '' };
          const t = setTimeout(() => this.authService.logout(), 2000);
          this.destroyRef.onDestroy(() => clearTimeout(t));
        },
        error: (err) => {
          this.successMessage.set('');
          this.errorMessage.set(err?.error?.message ?? 'Something went wrong.');
        },
      });
  }
}