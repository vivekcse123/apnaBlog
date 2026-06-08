import {
  ChangeDetectionStrategy, Component, OnInit, inject, signal, computed, PLATFORM_ID
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { RouterLink, Router } from '@angular/router';
import { Location } from '@angular/common';
import { Meta, Title } from '@angular/platform-browser';
import { environment } from '../../../../../environments/environment';
import { Auth } from '../../../../core/services/auth';
import { MobileBottomNav } from '../../../../shared/mobile-bottom-nav/mobile-bottom-nav';

export interface Challenge {
  _id:             string;
  title:           string;
  description:     string;
  banner:          string | null;
  prize:           string | null;
  category:        string | null;
  startDate:       string;
  endDate:         string;
  isActive:        boolean;
  submissionCount: number;
  createdBy:       { name: string; avatar?: string } | null;
}

interface LeaderboardPost {
  _id:           string;
  title:         string;
  slug:          string;
  description:   string;
  featuredImage: string | null;
  likesCount:    number;
  views:         number;
  commentsCount: number;
  createdAt:     string;
  challengeId:   string | null;
  user: { name: string; avatar?: string; karma?: number } | null;
}

interface UserPost {
  _id:          string;
  title:        string;
  description:  string;
  status:       string;
  challengeId:  string | null;
  createdAt:    string;
}

@Component({
  selector: 'app-challenges',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, RouterLink, MobileBottomNav],
  templateUrl: './challenges.html',
  styleUrl: './challenges.css',
})
export class ChallengesPage implements OnInit {
  private http       = inject(HttpClient);
  private router     = inject(Router);
  private location   = inject(Location);
  private meta       = inject(Meta);
  private titleSvc   = inject(Title);
  private auth       = inject(Auth);
  private platformId = inject(PLATFORM_ID);

  challenges    = signal<Challenge[]>([]);
  leaderboard   = signal<LeaderboardPost[]>([]);
  selectedId    = signal<string | null>(null);
  isLoading     = signal(true);
  lbLoading     = signal(false);

  // ── Submit modal ──────────────────────────────────────────────────────────
  showSubmitModal  = signal(false);
  userPosts        = signal<UserPost[]>([]);
  userPostsLoading = signal(false);
  selectedPostId   = signal<string | null>(null);
  submitLoading    = signal(false);
  submitMsg        = signal('');
  submitMsgType    = signal<'success' | 'error'>('success');
  postSearch       = signal('');

  filteredUserPosts = computed(() => {
    const q = this.postSearch().toLowerCase();
    return this.userPosts().filter(p =>
      !q || p.title.toLowerCase().includes(q) || p.description.toLowerCase().includes(q)
    );
  });

  selectedChallenge = computed(() =>
    this.challenges().find(c => c._id === this.selectedId()) ?? null
  );

  isLoggedIn = computed(() => !!this.auth.userId());

  ngOnInit(): void {
    this.titleSvc.setTitle('Writing Challenges | ApnaInsights');
    this.meta.updateTag({ name: 'description', content: 'Join writing challenges on ApnaInsights. Write on a theme, compete with the community, and win recognition.' });
    this.meta.updateTag({ name: 'robots', content: 'index, follow' });
    this.loadChallenges();
  }

  private loadChallenges(): void {
    this.isLoading.set(true);
    this.http.get<any>(`${environment.apiUrl}/challenge`).subscribe({
      next: res => {
        this.challenges.set(res.data ?? []);
        this.isLoading.set(false);
        if (res.data?.length) this.selectChallenge(res.data[0]._id);
      },
      error: () => this.isLoading.set(false),
    });
  }

  selectChallenge(id: string): void {
    if (this.selectedId() === id) return;
    this.selectedId.set(id);
    this.lbLoading.set(true);
    this.leaderboard.set([]);
    this.http.get<any>(`${environment.apiUrl}/challenge/${id}/posts`).subscribe({
      next: res => { this.leaderboard.set(res.data ?? []); this.lbLoading.set(false); },
      error: () => this.lbLoading.set(false),
    });
  }

  // ── Submit flow ────────────────────────────────────────────────────────────
  openSubmitModal(): void {
    const userId = this.auth.userId();
    if (!userId) return;
    this.showSubmitModal.set(true);
    this.selectedPostId.set(null);
    this.submitMsg.set('');
    this.postSearch.set('');
    this.userPostsLoading.set(true);

    this.http.get<any>(`${environment.apiUrl}/post/user/${userId}?limit=100`).subscribe({
      next: res => {
        const all: UserPost[] = res.data ?? [];
        // Only show published posts that aren't already in a challenge
        this.userPosts.set(all.filter(p => p.status === 'published' && !p.challengeId));
        this.userPostsLoading.set(false);
      },
      error: () => this.userPostsLoading.set(false),
    });
  }

  closeSubmitModal(): void {
    this.showSubmitModal.set(false);
    this.submitMsg.set('');
    this.selectedPostId.set(null);
  }

  submitToChallenge(): void {
    const challengeId = this.selectedId();
    const postId      = this.selectedPostId();
    if (!challengeId || !postId) {
      this.submitMsg.set('Please select a post first.');
      this.submitMsgType.set('error');
      return;
    }

    this.submitLoading.set(true);
    this.submitMsg.set('');

    const token   = this.auth.getToken();
    const headers = token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : undefined;

    this.http.post<any>(
      `${environment.apiUrl}/challenge/${challengeId}/submit/${postId}`,
      {},
      headers ? { headers } : {}
    ).subscribe({
      next: () => {
        this.submitLoading.set(false);
        this.submitMsg.set('🎉 Submitted successfully! Good luck!');
        this.submitMsgType.set('success');
        // Refresh leaderboard
        setTimeout(() => {
          this.closeSubmitModal();
          this.selectChallenge(challengeId);
        }, 1800);
      },
      error: err => {
        this.submitLoading.set(false);
        this.submitMsg.set(err?.error?.message ?? 'Submission failed. Try again.');
        this.submitMsgType.set('error');
      },
    });
  }

  goBack(): void { this.location.back(); }

  // ── Helpers ────────────────────────────────────────────────────────────────
  daysLeft(endDate: string): number {
    return Math.max(0, Math.ceil((new Date(endDate).getTime() - Date.now()) / 86_400_000));
  }

  navigateToBlog(post: LeaderboardPost): void {
    this.router.navigate(['/blog', post.slug || post._id]);
    if (isPlatformBrowser(this.platformId)) window.scrollTo({ top: 0, behavior: 'instant' });
  }
}
