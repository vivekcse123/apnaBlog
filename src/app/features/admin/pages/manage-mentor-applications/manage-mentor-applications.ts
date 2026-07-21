import { ChangeDetectionStrategy, Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MentorApplicationService } from '../../../career-guides/services/mentor-application.service';
import { MentorApplicationRecord, MentorApplicationStatus } from '../../../career-guides/models/mentor-application.model';
import { DecodeEntitiesPipe } from '../../../../shared/pipes/decode-entities-pipe';

type Tab = MentorApplicationStatus;

@Component({
  selector: 'app-manage-mentor-applications',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, DecodeEntitiesPipe],
  templateUrl: './manage-mentor-applications.html',
  styleUrl: './manage-mentor-applications.css',
})
export class ManageMentorApplications implements OnInit {
  private mentorApplicationService = inject(MentorApplicationService);
  private destroyRef = inject(DestroyRef);

  applications = signal<MentorApplicationRecord[]>([]);
  isLoading = signal(true);
  error = signal('');
  activeTab = signal<Tab>('pending');

  expandedId = signal<string | null>(null);

  // Approve flow: slug input shown inline once "Approve" is clicked.
  approvingId = signal<string | null>(null);
  approveSlug = signal('');
  approveError = signal('');
  isApproving = signal(false);

  // Reject flow: optional reason input shown inline once "Reject" is clicked.
  rejectingId = signal<string | null>(null);
  rejectReason = signal('');
  isRejecting = signal(false);

  filtered = computed(() => this.applications().filter(a => a.status === this.activeTab()));
  pendingCount = computed(() => this.applications().filter(a => a.status === 'pending').length);

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.isLoading.set(true);
    this.error.set('');
    this.mentorApplicationService.list()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => { this.applications.set(res.data ?? []); this.isLoading.set(false); },
        error: (err) => {
          this.error.set(err?.error?.message ?? 'Failed to load mentor applications.');
          this.isLoading.set(false);
        },
      });
  }

  setTab(tab: Tab): void { this.activeTab.set(tab); this.expandedId.set(null); }

  toggleExpand(id: string): void {
    this.expandedId.set(this.expandedId() === id ? null : id);
  }

  applicantName(app: MentorApplicationRecord): string {
    return typeof app.user === 'object' ? app.user.name : app.fullName;
  }
  applicantEmail(app: MentorApplicationRecord): string {
    return typeof app.user === 'object' ? app.user.email : '';
  }

  startApprove(app: MentorApplicationRecord): void {
    this.approvingId.set(app._id);
    this.rejectingId.set(null);
    this.approveError.set('');
    // Suggest a slug from the applicant's name so the admin usually just confirms.
    this.approveSlug.set(this.applicantName(app).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''));
  }
  cancelApprove(): void { this.approvingId.set(null); this.approveError.set(''); }

  confirmApprove(app: MentorApplicationRecord): void {
    const slug = this.approveSlug().trim();
    if (!slug || !/^[a-z0-9-]+$/.test(slug)) {
      this.approveError.set('Slug must be lowercase letters, numbers, and hyphens only.');
      return;
    }
    if (this.isApproving()) return;

    this.isApproving.set(true);
    this.approveError.set('');
    this.mentorApplicationService.approve(app._id, slug)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.isApproving.set(false);
          this.approvingId.set(null);
          this.applications.update(list => list.map(a => a._id === app._id ? res.data : a));
        },
        error: (err) => {
          this.isApproving.set(false);
          this.approveError.set(err?.error?.message ?? 'Could not approve this application.');
        },
      });
  }

  startReject(app: MentorApplicationRecord): void {
    this.rejectingId.set(app._id);
    this.approvingId.set(null);
    this.rejectReason.set('');
  }
  cancelReject(): void { this.rejectingId.set(null); }

  confirmReject(app: MentorApplicationRecord): void {
    if (this.isRejecting()) return;
    this.isRejecting.set(true);
    this.mentorApplicationService.reject(app._id, this.rejectReason().trim())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.isRejecting.set(false);
          this.rejectingId.set(null);
          this.applications.update(list => list.map(a => a._id === app._id ? res.data : a));
        },
        error: (err) => {
          this.isRejecting.set(false);
          alert(err?.error?.message ?? 'Could not reject this application.');
        },
      });
  }
}
