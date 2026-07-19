import { Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, of, shareReplay, tap, catchError, finalize } from 'rxjs';
import { PostService } from '../../features/post/services/post-service';
import { TaxonomyService } from '../../core/services/taxonomy.service';
import { Post } from '../../core/models/post.model';

export interface AssistantResult {
  id:       string;
  title:    string;
  category: string;
  views:    number;
  excerpt:  string;
  slug?:    string;
}

export interface AssistantChip {
  label: string;
  query: string;
}

export interface AssistantReply {
  text:     string;
  results?: AssistantResult[];
  chips?:   AssistantChip[];
}

interface FaqEntry {
  keywords: string[];
  answer:   string;
  chips?:   AssistantChip[];
}

// Guided-help knowledge base for "how do I …" style questions. This is
// intentionally NOT a generative model — every answer here is a fixed,
// human-written string describing a real feature of the app, matched by
// keyword overlap. See project-ai-platform-initiative memory: the user
// explicitly chose a rule-based guide over a real LLM integration.
const FAQ: FaqEntry[] = [
  {
    keywords: ['bookmark', 'save article', 'save post', 'save for later', 'read later'],
    answer: "Tap the bookmark icon on any article to save it. You can find everything you've saved later from your Dashboard → Bookmarks.",
  },
  {
    keywords: ['write', 'publish', 'new post', 'new story', 'new article', 'create post', 'become a writer', 'start writing'],
    answer: 'Open your Dashboard and tap "Write Story" to start a new post — you can save it as a draft or publish right away.',
  },
  {
    keywords: ['dark mode', 'light mode', 'theme', 'switch theme'],
    answer: 'You can switch between light and dark mode using the theme toggle in the header.',
  },
  {
    keywords: ['follow author', 'follow writer', 'follow user', 'unfollow'],
    answer: "Visit any author's profile page and tap Follow to see more of their work show up for you.",
  },
  {
    keywords: ['shorts', 'short video', 'reels'],
    answer: 'Shorts are quick, scrollable video posts — you can browse them from the Shorts tab in the main navigation.',
  },
  {
    keywords: ['my stats', 'my dashboard', 'reading history', 'my views', 'my followers', 'writing streak'],
    answer: 'Your Dashboard shows your stories, views, followers, comments, bookmarks, and continue-reading history all in one place.',
  },
  {
    keywords: ['settings', 'account', 'my profile', 'change password', 'delete account'],
    answer: 'Account and profile settings live under Dashboard → Settings.',
  },
  {
    keywords: ['contact', 'advertise', 'sponsor', 'sponsorship', 'business inquiry'],
    answer: 'For sponsorships or business inquiries, check out the Advertise page — for anything else, use Contact Us.',
  },
  {
    keywords: ['what is apnainsights', 'about apnainsights', 'who are you', 'what is this site', 'what can you do'],
    answer: "ApnaInsights is a community blogging platform covering Technology, AI, and Career topics. I can help you find articles, categories, and authors, or point you to a feature — just ask, e.g. \"Show me AI articles\" or \"How do I bookmark a post\".",
    chips: [
      { label: 'Browse categories', query: 'categories' },
      { label: 'Trending articles', query: 'trending' },
    ],
  },
];

const STOPWORDS = new Set([
  'a', 'an', 'the', 'i', 'me', 'my', 'want', 'need', 'find', 'show', 'give',
  'about', 'for', 'on', 'to', 'of', 'and', 'is', 'are', 'some', 'any',
  'please', 'can', 'you', 'article', 'articles', 'post', 'posts', 'blog', 'blogs',
]);

@Injectable({ providedIn: 'root' })
export class AiAssistantService {
  private postService     = inject(PostService);
  private taxonomyService = inject(TaxonomyService);
  private router           = inject(Router);

  private allPosts = signal<Post[]>([]);
  private loaded   = signal(false);
  private inflight: Observable<void> | null = null;

  /** Fetch posts + taxonomy once, cached for the lifetime of the app. */
  ensureLoaded(): Observable<void> {
    if (this.loaded()) return of(undefined);
    if (this.inflight) return this.inflight;

    this.taxonomyService.load().subscribe();

    this.inflight = this.postService.getAllPublished().pipe(
      tap(posts => { this.allPosts.set(posts ?? []); this.loaded.set(true); }),
      catchError(() => { this.loaded.set(true); return of([]); }),
      shareReplay(1),
      finalize(() => { this.inflight = null; }),
      tap(() => undefined),
    ) as unknown as Observable<void>;

    return this.inflight;
  }

  greeting(): AssistantReply {
    return {
      text: "Hi! I can help you find articles, categories, or authors on ApnaInsights — or answer questions about how the site works.",
      chips: [
        { label: 'Beginner Angular articles', query: 'beginner angular' },
        { label: 'Interview prep', query: 'interview' },
        { label: 'Latest AI articles', query: 'latest ai' },
        { label: 'How do I bookmark an article?', query: 'how do I bookmark an article' },
      ],
    };
  }

  ask(rawQuery: string): AssistantReply {
    const q = rawQuery.trim().toLowerCase();
    if (!q) return this.greeting();

    const faqHit = this.matchFaq(q);
    if (faqHit) return faqHit;

    if (/\b(categories|category|topics)\b/.test(q)) {
      return this.categoryOverviewReply();
    }

    const categoryHit = this.matchCategory(q);
    if (categoryHit) return categoryHit;

    if (/\b(trending|popular|most read|most viewed)\b/.test(q)) {
      return this.topByViewsReply();
    }

    if (/\b(latest|new|recent|this week)\b/.test(q)) {
      return this.latestReply();
    }

    const authorHit = this.matchAuthor(q);
    if (authorHit) return authorHit;

    return this.keywordSearchReply(q);
  }

  navigateToPost(result: AssistantResult): void {
    this.router.navigate(['/blog', result.slug || result.id]);
  }

  navigateToCategory(name: string): void {
    this.router.navigate(['/category', name.toLowerCase()]);
  }

  // ── Intent handlers ──────────────────────────────────────────────

  private matchFaq(q: string): AssistantReply | null {
    let best: FaqEntry | null = null;
    let bestScore = 0;
    for (const entry of FAQ) {
      const score = entry.keywords.reduce((s, kw) => s + (q.includes(kw) ? kw.split(' ').length : 0), 0);
      if (score > bestScore) { bestScore = score; best = entry; }
    }
    if (!best) return null;
    return { text: best.answer, chips: best.chips };
  }

  private matchCategory(q: string): AssistantReply | null {
    const cats = this.taxonomyService.categories();
    const match = cats.find(c => q.includes(c.name.toLowerCase()));
    if (!match) return null;

    const results = this.toResults(
      this.allPosts()
        .filter(p => p.categories?.some(c => c.toLowerCase() === match.name.toLowerCase()))
        .sort((a, b) => (b.views ?? 0) - (a.views ?? 0))
        .slice(0, 5)
    );

    if (results.length === 0) {
      return { text: `I couldn't find any published articles in ${match.name} yet.`, chips: this.categoryChips() };
    }

    return {
      text: `In ${match.emoji ?? ''} ${match.name}, start with ${this.directAnswer(results, '')}`.trim(),
      results,
      chips: [{ label: `Browse all ${match.name} →`, query: `__category__${match.name}` }],
    };
  }

  private matchAuthor(q: string): AssistantReply | null {
    const authorMatch = /\bby ([a-z .]+)$/i.exec(q) || /\bfrom ([a-z .]+)$/i.exec(q);
    if (!authorMatch) return null;
    const name = authorMatch[1].trim();
    if (name.length < 2) return null;

    const results = this.toResults(
      this.allPosts()
        .filter(p => ((p.user as any)?.name ?? '').toLowerCase().includes(name))
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 5)
    );

    if (results.length === 0) return null;
    return { text: `From ${name}: ${this.directAnswer(results, '')}`, results };
  }

  private topByViewsReply(): AssistantReply {
    const results = this.toResults(
      [...this.allPosts()].sort((a, b) => (b.views ?? 0) - (a.views ?? 0)).slice(0, 5)
    );
    return { text: `The most-read article right now is ${this.directAnswer(results, "nothing's trending yet.")}`, results };
  }

  private latestReply(): AssistantReply {
    const results = this.toResults(
      [...this.allPosts()].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 5)
    );
    return { text: `Just published: ${this.directAnswer(results, 'nothing published yet.')}`, results };
  }

  private categoryOverviewReply(): AssistantReply {
    const cats = this.taxonomyService.categories();
    if (cats.length === 0) {
      return { text: "I couldn't load the category list right now — try browsing from the main menu instead." };
    }
    return {
      text: 'Here are the categories on ApnaInsights:',
      chips: this.categoryChips(),
    };
  }

  private keywordSearchReply(q: string): AssistantReply {
    const words = q.split(/\s+/).map(w => w.replace(/[^a-z0-9]/g, '')).filter(w => w.length > 2 && !STOPWORDS.has(w));

    if (words.length === 0) {
      return { text: "I'm not sure what you're looking for — try asking about a topic, category, or author.", chips: this.categoryChips() };
    }

    const scored = this.allPosts().map(p => {
      const haystack = `${p.title} ${p.description ?? ''} ${(p.categories ?? []).join(' ')}`.toLowerCase();
      const score = words.reduce((s, w) => s + (haystack.includes(w) ? 1 : 0), 0);
      return { post: p, score };
    }).filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map(x => x.post);

    if (scored.length === 0) {
      return {
        text: `I couldn't find anything matching "${q}". Try one of these instead:`,
        chips: this.categoryChips(),
      };
    }

    const results = this.toResults(scored);
    return { text: this.directAnswer(results, ''), results };
  }

  private categoryChips(): AssistantChip[] {
    return this.taxonomyService.categories().slice(0, 6).map(c => ({ label: c.name, query: `__category__${c.name}` }));
  }

  private toResults(posts: Post[]): AssistantResult[] {
    return posts.map(p => ({
      id:       p._id,
      title:    p.title,
      category: p.categories?.[0] ?? '',
      views:    p.views ?? 0,
      excerpt:  this.truncate(p.description, 110),
      slug:     (p as any).slug,
    }));
  }

  /** Leads with the single best match by name instead of a generic "here's what I found" line — the point is
   *  to answer directly, not just hand back a link list. Falls back to `fallback` if there are no results. */
  private directAnswer(results: AssistantResult[], fallback: string): string {
    if (results.length === 0) return fallback;
    const [top, ...rest] = results;
    const lead = `"${top.title}" — ${top.excerpt || 'read the full article for details.'}`;
    return rest.length > 0 ? `${lead} Plus ${rest.length} more below.` : lead;
  }

  private truncate(text: string | undefined, max: number): string {
    const t = (text ?? '').trim();
    if (t.length <= max) return t;
    return t.slice(0, max).replace(/\s+\S*$/, '') + '…';
  }
}
