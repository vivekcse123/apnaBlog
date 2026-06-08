import {
  ChangeDetectionStrategy, Component, OnInit, inject, signal, computed
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { environment } from '../../../../../environments/environment';
import { Auth } from '../../../../core/services/auth';

interface Challenge {
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
}

interface LeaderboardPost {
  _id:              string;
  title:            string;
  slug:             string;
  featuredImage:    string | null;
  likesCount:       number;
  views:            number;
  isFeaturedWinner: boolean;
  featuredWinnerRank: number | null;
  user: { name: string } | null;
}

interface ChallengeForm {
  title:       string;
  description: string;
  banner:      string;
  prize:       string;
  category:    string;
  startDate:   string;
  endDate:     string;
}

@Component({
  selector: 'app-manage-challenges',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  templateUrl: './manage-challenges.html',
  styleUrl: './manage-challenges.css',
})
export class ManageChallenges implements OnInit {
  private http    = inject(HttpClient);
  private auth    = inject(Auth);
  private apiBase = environment.apiUrl;

  challenges  = signal<Challenge[]>([]);
  isLoading   = signal(true);
  showForm    = signal(false);
  saving      = signal(false);
  saveMsg     = signal('');
  saveMsgType = signal<'success' | 'error'>('success');
  editId      = signal<string | null>(null);

  // ── Declare winners ──────────────────────────────────────────────────────────
  showWinnersModal   = signal(false);
  winnersChallenge   = signal<Challenge | null>(null);
  leaderboard        = signal<LeaderboardPost[]>([]);
  lbLoading          = signal(false);
  selectedWinners    = signal<{ rank: 1 | 2 | 3; postId: string }[]>([]);
  declaringWinners   = signal(false);
  winnersMsg         = signal('');
  winnersMsgType     = signal<'success' | 'error'>('success');

  rank1Post = computed(() => this.selectedWinners().find(w => w.rank === 1)?.postId ?? null);
  rank2Post = computed(() => this.selectedWinners().find(w => w.rank === 2)?.postId ?? null);
  rank3Post = computed(() => this.selectedWinners().find(w => w.rank === 3)?.postId ?? null);

  form: ChallengeForm = {
    title: '', description: '', banner: '', prize: '',
    category: '', startDate: '', endDate: '',
  };

  readonly categories = [
    '', 'Update', 'News', 'Sports', 'Technology', 'Lifestyle',
    'Education', 'Health', 'Business', 'Entertainment', 'Social',
    'Village', 'Exercise', 'Quotes', 'Cooking',
  ];

  ngOnInit(): void { this.load(); }

  private headers(): HttpHeaders | undefined {
    const token = this.auth.getToken();
    return token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : undefined;
  }

  private load(): void {
    this.isLoading.set(true);
    const h = this.headers();
    this.http.get<any>(`${this.apiBase}/challenge/all`, h ? { headers: h } : {}).subscribe({
      next: res => { this.challenges.set(res.data ?? []); this.isLoading.set(false); },
      error: ()  => this.isLoading.set(false),
    });
  }

  openCreate(): void {
    this.editId.set(null);
    this.form = { title: '', description: '', banner: '', prize: '', category: '', startDate: '', endDate: '' };
    this.saveMsg.set('');
    this.showForm.set(true);
  }

  openEdit(c: Challenge): void {
    this.editId.set(c._id);
    this.form = {
      title:       c.title,
      description: c.description,
      banner:      c.banner    ?? '',
      prize:       c.prize     ?? '',
      category:    c.category  ?? '',
      startDate:   c.startDate ? c.startDate.slice(0, 10) : '',
      endDate:     c.endDate   ? c.endDate.slice(0, 10)   : '',
    };
    this.saveMsg.set('');
    this.showForm.set(true);
  }

  save(): void {
    if (!this.form.title.trim() || !this.form.description.trim() || !this.form.startDate || !this.form.endDate) {
      this.saveMsg.set('Title, description, start date and end date are required.');
      this.saveMsgType.set('error');
      return;
    }
    if (new Date(this.form.endDate) <= new Date(this.form.startDate)) {
      this.saveMsg.set('End date must be after start date.');
      this.saveMsgType.set('error');
      return;
    }

    this.saving.set(true);
    this.saveMsg.set('');
    const body = {
      title:       this.form.title.trim(),
      description: this.form.description.trim(),
      banner:      this.form.banner    || null,
      prize:       this.form.prize     || null,
      category:    this.form.category  || null,
      startDate:   this.form.startDate,
      endDate:     this.form.endDate,
    };

    const id  = this.editId();
    const h   = this.headers();
    const req = id
      ? this.http.patch<any>(`${this.apiBase}/challenge/${id}`, body, h ? { headers: h } : {})
      : this.http.post<any>(`${this.apiBase}/challenge`, body, h ? { headers: h } : {});

    req.subscribe({
      next: () => {
        this.saving.set(false);
        this.saveMsg.set(id ? 'Challenge updated!' : 'Challenge created!');
        this.saveMsgType.set('success');
        this.load();
        setTimeout(() => { this.showForm.set(false); this.saveMsg.set(''); }, 1200);
      },
      error: err => {
        this.saving.set(false);
        this.saveMsg.set(err?.error?.message ?? 'Failed to save. Try again.');
        this.saveMsgType.set('error');
      },
    });
  }

  toggleActive(c: Challenge): void {
    const h = this.headers();
    this.http.patch<any>(`${this.apiBase}/challenge/${c._id}`, { isActive: !c.isActive }, h ? { headers: h } : {})
      .subscribe({ next: () => this.load() });
  }

  // ── Declare winners flow ────────────────────────────────────────────────────
  openWinnersModal(c: Challenge): void {
    this.winnersChallenge.set(c);
    this.selectedWinners.set([]);
    this.winnersMsg.set('');
    this.showWinnersModal.set(true);
    this.lbLoading.set(true);

    this.http.get<any>(`${this.apiBase}/challenge/${c._id}/posts`).subscribe({
      next: res => {
        this.leaderboard.set(res.data ?? []);
        // Pre-fill if already declared
        const preselect: { rank: 1 | 2 | 3; postId: string }[] = [];
        for (const p of (res.data ?? []) as LeaderboardPost[]) {
          if (p.isFeaturedWinner && p.featuredWinnerRank && p.featuredWinnerRank <= 3) {
            preselect.push({ rank: p.featuredWinnerRank as 1 | 2 | 3, postId: p._id });
          }
        }
        this.selectedWinners.set(preselect);
        this.lbLoading.set(false);
      },
      error: () => this.lbLoading.set(false),
    });
  }

  closeWinnersModal(): void {
    this.showWinnersModal.set(false);
    this.winnersMsg.set('');
  }

  assignRank(postId: string, rank: 1 | 2 | 3): void {
    this.selectedWinners.update(list => {
      // remove any existing assignment for this rank and this post
      const filtered = list.filter(w => w.rank !== rank && w.postId !== postId);
      return [...filtered, { rank, postId }];
    });
  }

  clearRank(rank: 1 | 2 | 3): void {
    this.selectedWinners.update(list => list.filter(w => w.rank !== rank));
  }

  declareWinners(): void {
    const winners = this.selectedWinners();
    if (winners.length === 0) {
      this.winnersMsg.set('Select at least one winner first.');
      this.winnersMsgType.set('error');
      return;
    }
    const cid = this.winnersChallenge()?._id;
    if (!cid) return;

    this.declaringWinners.set(true);
    this.winnersMsg.set('');
    const h = this.headers();

    this.http.post<any>(
      `${this.apiBase}/challenge/${cid}/declare-winners`,
      { winners },
      h ? { headers: h } : {}
    ).subscribe({
      next: () => {
        this.declaringWinners.set(false);
        this.winnersMsg.set('🎉 Winners declared! Posts are now featured on the homepage.');
        this.winnersMsgType.set('success');
        this.load();
        setTimeout(() => this.closeWinnersModal(), 2000);
      },
      error: err => {
        this.declaringWinners.set(false);
        this.winnersMsg.set(err?.error?.message ?? 'Failed to declare winners.');
        this.winnersMsgType.set('error');
      },
    });
  }

  getRankForPost(postId: string): number | null {
    return this.selectedWinners().find(w => w.postId === postId)?.rank ?? null;
  }

  getPostTitle(postId: string): string {
    return this.leaderboard().find(p => p._id === postId)?.title ?? '';
  }

  getWinnerByRank(rank: number): { rank: 1 | 2 | 3; postId: string } | null {
    return this.selectedWinners().find(w => w.rank === rank) ?? null;
  }

  daysLeft(endDate: string): number {
    return Math.max(0, Math.ceil((new Date(endDate).getTime() - Date.now()) / 86_400_000));
  }

  cancel(): void { this.showForm.set(false); this.saveMsg.set(''); }
}
