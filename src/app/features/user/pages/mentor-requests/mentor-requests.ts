import { Component, ChangeDetectionStrategy, OnInit, effect, inject, signal, untracked } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { CallbackRequestService } from '../../../career-guides/services/callback-request.service';
import { CallbackRequestRecord, CallbackStatus } from '../../../career-guides/models/callback-request.model';

const STATUSES: CallbackStatus[] = ['pending', 'accepted', 'rejected', 'scheduled', 'completed', 'cancelled', 'expired'];

// Mentor's own view of the same callback-request data the admin dashboard
// sees - scoped server-side to their mentorSlug (see
// blogApp/src/routes/callback-request.router.js's /for-mentor endpoint), not
// filtered client-side, so a mentor genuinely cannot see other mentors' requests.
@Component({
  selector: 'app-mentor-requests',
  standalone: true,
  imports: [CommonModule, DatePipe],
  templateUrl: './mentor-requests.html',
  styleUrl: './mentor-requests.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MentorRequests implements OnInit {
  private callbackRequests = inject(CallbackRequestService);

  readonly statuses = STATUSES;

  requests = signal<CallbackRequestRecord[]>([]);
  isLoading = signal(true);
  error = signal('');
  updating = signal<Set<string>>(new Set());
  expandedId = signal<string | null>(null);
  statusFilter = signal<CallbackStatus | ''>('');

  constructor() {
    effect(() => {
      this.callbackRequests.liveTick();
      if (!untracked(this.isLoading)) this.load();
    });
  }

  ngOnInit(): void {
    this.callbackRequests.ensureLive();
    this.load();
  }

  setFilter(status: CallbackStatus | ''): void {
    this.statusFilter.set(status);
    this.load();
  }

  load(): void {
    this.isLoading.set(true);
    this.error.set('');
    this.callbackRequests.forMentor(this.statusFilter() || undefined).subscribe({
      next: (res) => { this.requests.set(res.data ?? []); this.isLoading.set(false); },
      error: (err) => {
        this.error.set(err?.error?.message ?? 'Failed to load your assigned requests.');
        this.isLoading.set(false);
      },
    });
  }

  toggleExpand(id: string): void {
    this.expandedId.set(this.expandedId() === id ? null : id);
  }

  // Accept/Reject/Schedule are the initial triage decision - only valid
  // while nothing has been decided yet. Mark Completed only makes sense
  // once the mentor has actually accepted/scheduled and followed up with
  // the requester - not before, and not once it's already resolved.
  canDecide(status: CallbackStatus): boolean { return status === 'pending'; }
  canComplete(status: CallbackStatus): boolean { return status === 'accepted' || status === 'scheduled'; }

  updateStatus(id: string, status: CallbackStatus): void {
    const set = new Set(this.updating());
    set.add(id);
    this.updating.set(set);
    this.callbackRequests.updateStatus(id, status).subscribe({
      next: (res) => {
        this.requests.update(list => list.map(r => r._id === id ? res.data : r));
        const s = new Set(this.updating()); s.delete(id); this.updating.set(s);
      },
      error: (err) => {
        alert(err?.error?.message ?? 'Could not update this request.');
        const s = new Set(this.updating()); s.delete(id); this.updating.set(s);
      },
    });
  }

  trackById(_i: number, r: CallbackRequestRecord): string { return r._id; }
}
