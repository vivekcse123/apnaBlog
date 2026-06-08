import { ChangeDetectionStrategy, Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Router } from '@angular/router';
import { environment } from '../../../../../environments/environment';
import { Auth } from '../../../../core/services/auth';

interface FlagEntry {
  _id:       string;
  post: {
    _id:          string;
    title:        string;
    slug:         string;
    isFlagged:    boolean;
    flagCount:    number;
    status:       string;
    user?:        { name: string } | null;
  } | null;
  user:      { _id: string; name: string; email: string } | null;
  reason:    string;
  details:   string;
  resolved:  boolean;
  createdAt: string;
}

interface GroupedFlags {
  postId:    string;
  postTitle: string;
  slug:      string;
  isFlagged: boolean;
  flagCount: number;
  author:    string;
  flags:     FlagEntry[];
  expanded:  boolean;
}

@Component({
  selector: 'app-manage-flags',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  templateUrl: './manage-flags.html',
  styleUrl: './manage-flags.css',
})
export class ManageFlags implements OnInit {
  private http   = inject(HttpClient);
  private auth   = inject(Auth);
  private router = inject(Router);

  flags    = signal<FlagEntry[]>([]);
  isLoading = signal(true);
  error    = signal('');
  resolving = signal<Set<string>>(new Set());

  grouped = computed<GroupedFlags[]>(() => {
    const map = new Map<string, GroupedFlags>();
    for (const f of this.flags()) {
      if (!f.post) continue;
      const pid = f.post._id;
      if (!map.has(pid)) {
        map.set(pid, {
          postId: pid,
          postTitle: f.post.title,
          slug: f.post.slug,
          isFlagged: f.post.isFlagged,
          flagCount: f.post.flagCount,
          author: f.post.user?.name ?? 'Unknown',
          flags: [],
          expanded: false,
        });
      }
      map.get(pid)!.flags.push(f);
    }
    return Array.from(map.values());
  });

  ngOnInit(): void {
    this.loadFlags();
  }

  private headers(): HttpHeaders | undefined {
    const token = this.auth.getToken();
    return token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : undefined;
  }

  loadFlags(): void {
    this.isLoading.set(true);
    this.error.set('');
    const h = this.headers();
    this.http.get<any>(`${environment.apiUrl}/flag`, h ? { headers: h } : {}).subscribe({
      next: res => { this.flags.set(res.data ?? []); this.isLoading.set(false); },
      error: err => {
        this.error.set(err?.error?.message ?? 'Failed to load flags.');
        this.isLoading.set(false);
      },
    });
  }

  toggleExpand(group: GroupedFlags): void {
    this.flags.update(f => f); // force signal tick — we mutate grouped directly below
    group.expanded = !group.expanded;
    this.flags.update(f => [...f]); // nudge signal to re-render
  }

  resolveAll(group: GroupedFlags): void {
    const postId = group.postId;
    const resolving = new Set(this.resolving());
    resolving.add(postId);
    this.resolving.set(resolving);

    const h = this.headers();
    this.http.patch<any>(
      `${environment.apiUrl}/flag/${postId}/resolve`,
      {},
      h ? { headers: h } : {}
    ).subscribe({
      next: () => {
        this.flags.update(list => list.filter(f => f.post?._id !== postId));
        const r = new Set(this.resolving());
        r.delete(postId);
        this.resolving.set(r);
      },
      error: err => {
        alert(err?.error?.message ?? 'Could not resolve flags.');
        const r = new Set(this.resolving());
        r.delete(postId);
        this.resolving.set(r);
      },
    });
  }

  viewPost(group: GroupedFlags): void {
    this.router.navigate(['/blog', group.slug || group.postId]);
  }

  reasonLabel(reason: string): string {
    const labels: Record<string, string> = {
      misinformation: 'Misinformation',
      spam: 'Spam',
      inappropriate: 'Inappropriate',
      plagiarism: 'Plagiarism',
      hate_speech: 'Hate Speech',
      other: 'Other',
    };
    return labels[reason] ?? reason;
  }
}
