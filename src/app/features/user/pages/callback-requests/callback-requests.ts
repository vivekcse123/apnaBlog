import { Component, ChangeDetectionStrategy, OnInit, effect, inject, signal, untracked } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { CallbackRequestService } from '../../../career-guides/services/callback-request.service';
import { CallbackRequestRecord } from '../../../career-guides/models/callback-request.model';

const STARS = [1, 2, 3, 4, 5];

@Component({
  selector: 'app-callback-requests',
  standalone: true,
  imports: [CommonModule, DatePipe, RouterLink],
  templateUrl: './callback-requests.html',
  styleUrl: './callback-requests.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CallbackRequests implements OnInit {
  private callbackRequests = inject(CallbackRequestService);

  readonly stars = STARS;

  requests = signal<CallbackRequestRecord[]>([]);
  isLoading = signal(true);
  error = signal('');
  cancelling = signal<Set<string>>(new Set());

  // Feedback form - one at a time, keyed by request id.
  feedbackOpenId = signal<string | null>(null);
  feedbackRating = signal(0);
  feedbackComment = signal('');
  feedbackSubmitting = signal(false);
  feedbackError = signal('');

  constructor() {
    // Live: any 'callback_created'/'callback_updated' event (this user's own
    // requests, or - harmlessly - anyone else's, since the tick is global)
    // triggers a refetch, so accept/reject/reschedule from the admin side
    // shows up here without a manual refresh.
    effect(() => {
      this.callbackRequests.liveTick();
      if (!untracked(this.isLoading)) this.load();
    });
  }

  ngOnInit(): void {
    this.callbackRequests.ensureLive();
    this.load();
  }

  load(): void {
    this.isLoading.set(true);
    this.error.set('');
    this.callbackRequests.mine().subscribe({
      next: (res) => { this.requests.set(res.data ?? []); this.isLoading.set(false); },
      error: (err) => {
        this.error.set(err?.error?.message ?? 'Failed to load your callback requests.');
        this.isLoading.set(false);
      },
    });
  }

  // 30-minute grace window from submission (mirrors the backend check in
  // callback-request.router.js's PATCH /:id/cancel, which is the real
  // enforcement) - this just hides a button that's guaranteed to 409.
  canCancel(r: CallbackRequestRecord): boolean {
    if (r.status !== 'pending') return false;
    const minutesSinceCreated = (Date.now() - new Date(r.createdAt).getTime()) / 60000;
    return minutesSinceCreated <= 30;
  }

  cancel(id: string): void {
    const set = new Set(this.cancelling());
    set.add(id);
    this.cancelling.set(set);
    this.callbackRequests.cancel(id).subscribe({
      next: (res) => {
        this.requests.update(list => list.map(r => r._id === id ? res.data : r));
        const s = new Set(this.cancelling()); s.delete(id); this.cancelling.set(s);
      },
      error: (err) => {
        alert(err?.error?.message ?? 'Could not cancel this request.');
        const s = new Set(this.cancelling()); s.delete(id); this.cancelling.set(s);
      },
    });
  }

  statusLabel(status: string): string {
    return status.charAt(0).toUpperCase() + status.slice(1);
  }

  openFeedback(id: string): void {
    this.feedbackOpenId.set(id);
    this.feedbackRating.set(0);
    this.feedbackComment.set('');
    this.feedbackError.set('');
  }

  closeFeedback(): void {
    this.feedbackOpenId.set(null);
  }

  submitFeedback(id: string): void {
    if (!this.feedbackRating() || this.feedbackSubmitting()) return;
    this.feedbackSubmitting.set(true);
    this.feedbackError.set('');
    this.callbackRequests.submitFeedback(id, {
      rating: this.feedbackRating(),
      comment: this.feedbackComment().trim(),
    }).subscribe({
      next: (res) => {
        this.requests.update(list => list.map(r => r._id === id ? res.data : r));
        this.feedbackSubmitting.set(false);
        this.feedbackOpenId.set(null);
      },
      error: (err) => {
        this.feedbackError.set(err?.error?.message ?? 'Could not submit feedback.');
        this.feedbackSubmitting.set(false);
      },
    });
  }

  trackById(_i: number, r: CallbackRequestRecord): string { return r._id; }
}
