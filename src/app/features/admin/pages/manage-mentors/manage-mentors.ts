import { ChangeDetectionStrategy, Component, OnInit, inject, signal, computed, DestroyRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AdminService } from '../../services/admin-service';
import { UserService } from '../../../user/services/user-service';
import { MentorProfileService } from '../../../career-guides/services/mentor-profile.service';
import { MentorProfileRecord } from '../../../career-guides/models/mentor-profile.model';
import { User } from '../../../user/models/user.mode';

@Component({
  selector: 'app-manage-mentors',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  templateUrl: './manage-mentors.html',
  styleUrl: './manage-mentors.css',
})
export class ManageMentors implements OnInit {
  private adminService = inject(AdminService);
  private userService = inject(UserService);
  private mentorProfileService = inject(MentorProfileService);
  private destroyRef = inject(DestroyRef);

  allUsers = signal<User[]>([]);
  isLoading = signal(true);
  error = signal('');

  mentors = computed(() => this.allUsers().filter(u => u.isMentor));

  // Suspend/activate confirm gate - same pattern as manage-users.ts.
  pendingMentor = signal<User | null>(null);
  showConfirm = signal(false);
  isTogglingStatus = signal(false);

  // Inline profile quick-edit.
  editingUserId = signal<string | null>(null);
  isLoadingProfile = signal(false);
  isSavingProfile = signal(false);
  profileError = signal('');
  editTitle = '';
  editCompany = '';
  editBio = '';
  editResponseTime = '';
  editSkills = '';
  editLanguages = '';
  editCertifications = '';

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.isLoading.set(true);
    this.error.set('');
    this.adminService.getAllUsersRaw(1, 1000)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => { this.allUsers.set(res.data ?? []); this.isLoading.set(false); },
        error: (err) => {
          this.error.set(err?.error?.message ?? 'Failed to load mentors.');
          this.isLoading.set(false);
        },
      });
  }

  requestToggleStatus(mentor: User): void {
    this.pendingMentor.set(mentor);
    this.showConfirm.set(true);
  }
  cancelToggleStatus(): void { this.showConfirm.set(false); this.pendingMentor.set(null); }

  confirmToggleStatus(): void {
    const mentor = this.pendingMentor();
    if (!mentor || this.isTogglingStatus()) return;
    const next = mentor.mentorStatus === 'suspended' ? 'active' : 'suspended';

    this.isTogglingStatus.set(true);
    this.userService.setMentorStatus(mentor._id, next)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.isTogglingStatus.set(false);
          this.showConfirm.set(false);
          this.pendingMentor.set(null);
          this.allUsers.update(list => list.map(u => u._id === mentor._id ? { ...u, ...res.data } : u));
        },
        error: (err) => {
          this.isTogglingStatus.set(false);
          alert(err?.error?.message ?? 'Could not update mentor status.');
        },
      });
  }

  startEditProfile(mentor: User): void {
    this.editingUserId.set(mentor._id);
    this.profileError.set('');
    this.isLoadingProfile.set(true);
    this.editTitle = ''; this.editCompany = ''; this.editBio = ''; this.editResponseTime = '';
    this.editSkills = ''; this.editLanguages = ''; this.editCertifications = '';

    this.mentorProfileService.getByUserId(mentor._id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.isLoadingProfile.set(false);
          const p = res.data;
          if (!p) return;
          this.editTitle = p.title;
          this.editCompany = p.company;
          this.editBio = p.bio;
          this.editResponseTime = p.responseTime;
          this.editSkills = p.skills.join(', ');
          this.editLanguages = p.languages.join(', ');
          this.editCertifications = p.certifications.join(', ');
        },
        error: () => { this.isLoadingProfile.set(false); },
      });
  }
  cancelEditProfile(): void { this.editingUserId.set(null); this.profileError.set(''); }

  private splitList(value: string): string[] {
    return value.split(',').map(s => s.trim()).filter(Boolean);
  }

  saveProfile(mentor: User): void {
    if (this.isSavingProfile()) return;
    if (!this.editTitle.trim()) {
      this.profileError.set('Title is required.');
      return;
    }
    if (!this.editBio.trim() || this.editBio.trim().length < 10) {
      this.profileError.set('Bio must be at least 10 characters.');
      return;
    }

    const payload: Partial<MentorProfileRecord> = {
      title: this.editTitle.trim(),
      company: this.editCompany.trim(),
      bio: this.editBio.trim(),
      responseTime: this.editResponseTime.trim(),
      skills: this.splitList(this.editSkills),
      languages: this.splitList(this.editLanguages),
      certifications: this.splitList(this.editCertifications),
    };

    this.isSavingProfile.set(true);
    this.profileError.set('');
    this.mentorProfileService.update(mentor._id, payload)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.isSavingProfile.set(false);
          this.editingUserId.set(null);
        },
        error: (err) => {
          this.isSavingProfile.set(false);
          this.profileError.set(err?.error?.message ?? 'Could not save this profile.');
        },
      });
  }
}
