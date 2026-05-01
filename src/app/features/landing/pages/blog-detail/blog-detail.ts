import {
  Component, inject, signal, OnInit, OnDestroy, DestroyRef,
  PLATFORM_ID, computed, AfterViewInit, ElementRef,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CommonModule, isPlatformBrowser, DOCUMENT, Location } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { fromEvent } from 'rxjs';
import { throttleTime, timeout } from 'rxjs/operators';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Meta, Title, DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { TransferState, makeStateKey } from '@angular/core';

import { PostService } from '../../../post/services/post-service';
import { PostCache } from '../../../post/services/post-cache';
import { Post } from '../../../../core/models/post.model';
import { ThemeService } from '../../../../core/services/theme-service';
import { Auth } from '../../../../core/services/auth';
import { UserService } from '../../../user/services/user-service';
import { User } from '../../../user/models/user.mode';

// ── Transfer-state key: SSR writes the post here; browser reads it instantly ──
const POST_STATE_KEY = makeStateKey<Post | null>('blogDetailPost');

interface DrawerReply {
  _id?:       string;
  name:       string;
  comment:    string;
  user?:      string | null;
  createdAt?: string;
}

interface DrawerComment {
  _id?:       string;
  name:       string;
  comment:    string;
  user:       string | null;
  createdAt:  string;
  replies?:   DrawerReply[];
  showReplies?: boolean;
}

interface TableOfContentsItem {
  id:    string;
  text:  string;
  level: number;
}

const COMMENT_PAGE_SIZE     = 5;
const SESSION_COMMENT_LIMIT = 10;
const AUTHOR_POSTS_PER_PAGE = 10;

// Valid display statuses — 'pending' posts are only visible to their owner/admin
// via direct URL but we still render them (no 404); they just won't be indexed.
const VISIBLE_STATUSES = new Set(['published', 'draft', 'pending']);

@Component({
  selector:    'app-blog-detail',
  standalone:  true,
  imports:     [RouterLink, CommonModule, FormsModule],
  templateUrl: './blog-detail.html',
  styleUrl:    './blog-detail.css',
  // ngSkipHydration prevents DOM reconciliation mismatches caused by the
  // imperative mutations in addCodeCopyButtons() / addHeadingIds().
  host: { ngSkipHydration: 'true' },
})
export class BlogDetail implements OnInit, AfterViewInit, OnDestroy {

  // ── Services ─────────────────────────────────────────────────────────────
  private postService   = inject(PostService);
  private postCache     = inject(PostCache);
  private destroyRef    = inject(DestroyRef);
  private route         = inject(ActivatedRoute);
  private router        = inject(Router);
  private location      = inject(Location);
  private auth          = inject(Auth);
  private userService   = inject(UserService);
  private platformId    = inject(PLATFORM_ID);
  private meta          = inject(Meta);
  private titleService  = inject(Title);
  private elementRef    = inject(ElementRef);
  private document      = inject(DOCUMENT);
  private sanitizer     = inject(DomSanitizer);
  private transferState = inject(TransferState);
  themeService          = inject(ThemeService);

  // ── Post state ────────────────────────────────────────────────────────────
  post         = signal<Post | null>(null);
  isLoading    = signal(true);
  loadError    = signal(false);
  relatedPosts = signal<Post[]>([]);
  currentYear  = new Date().getFullYear();

  // ── Carousel ──────────────────────────────────────────────────────────────
  currentSlide = signal(0);
  private carouselTimer: ReturnType<typeof setInterval> | null = null;

  carouselImages = computed(() => {
    const p = this.post();
    if (!p) return [];
    const seen = new Set<string>();
    const imgs: string[] = [];
    const add = (url: string | undefined | null) => {
      if (url && !seen.has(url)) { seen.add(url); imgs.push(url); }
    };
    add(p.featuredImage);
    (p.images ?? []).forEach(add);
    return imgs;
  });

  // Holds only the raw HTML string for the blog body. Kept separate from post()
  // so that like/view/comment mutations — which replace the post signal with a
  // new object but don't touch content — do NOT cause [innerHTML] to re-render
  // and destroy the imperatively injected code-block wrappers.
  private readonly _contentHtml = signal<string>('');

  // ── Translation ────────────────────────────────────────────────────────────
  readonly LANGUAGES = [
    { code: 'hi', label: 'हिंदी' },
    { code: 'mr', label: 'मराठी' },
    { code: 'ta', label: 'தமிழ்' },
    { code: 'te', label: 'తెలుగు' },
    { code: 'bn', label: 'বাংলা' },
    { code: 'gu', label: 'ગુજરાતી' },
  ];
  translation = signal<{ title: string; description: string; content: string } | null>(null);
  translating = signal(false);
  activeLang  = signal<string | null>(null);

  // bypassSecurityTrustHtml is intentional — content is authored/trusted DB content.
  // Falls back to original content when no translation is active.
  safeContent = computed<SafeHtml>(() =>
    this.sanitizer.bypassSecurityTrustHtml(this.translation()?.content ?? this._contentHtml())
  );

  // ── Likes / Bookmarks ─────────────────────────────────────────────────────
  likedPostIds      = signal<Set<string>>(new Set());
  bookmarkedPostIds = signal<Set<string>>(new Set());

  // ── Comments ──────────────────────────────────────────────────────────────
  commentText           = signal('');
  commentSubmitting     = signal(false);
  commentFeedback       = signal<{ type: 'success' | 'error'; msg: string } | null>(null);
  sessionCommentCount   = signal(0);
  commentLimitReached   = computed(() => this.sessionCommentCount() >= SESSION_COMMENT_LIMIT);
  commentsRemaining     = computed(() => SESSION_COMMENT_LIMIT - this.sessionCommentCount());

  commentDrawerOpen     = signal(false);
  drawerComments        = signal<DrawerComment[]>([]);
  drawerCommentsLoading = signal(false);
  loadingMoreComments   = signal(false);
  deletingCommentId     = signal<string | null>(null);
  totalCommentsCount    = signal(0);
  commentFetchedCount   = signal(0);

  hasMoreComments = computed(() =>
    this.commentFetchedCount() < this.totalCommentsCount()
  );

  // ── Current user ──────────────────────────────────────────────────────────
  private currentUserData = signal<User | null>(null);

  // ── Reading / ToC ─────────────────────────────────────────────────────────
  tableOfContents = signal<TableOfContentsItem[]>([]);
  activeHeadingId = signal<string>('');
  readingProgress = signal(0);
  readingTime     = signal(0);
  showToc         = signal(false);

  // ── Share ─────────────────────────────────────────────────────────────────
  shareCount      = signal(0);
  shareMenuOpen   = signal(false);
  copyLinkSuccess = signal(false);

  // ── Header visibility ─────────────────────────────────────────────────────
  headerHidden    = signal(false);
  private lastScrollY = 0;

  // ── Reply state ───────────────────────────────────────────────────────────
  replyingToId    = signal<string | null>(null);
  replyText       = signal('');
  replySubmitting = signal(false);
  replyFeedback   = signal<{ type: 'success' | 'error'; msg: string } | null>(null);
  deletingReplyId = signal<string | null>(null);

  // ── Follow state ──────────────────────────────────────────────────────────
  authorFollowersCount = signal(0);
  isFollowingAuthor    = signal(false);
  followLoading        = signal(false);
  authorId             = signal<string | null>(null);

  // ── Author profile modal ──────────────────────────────────────────────────
  showAuthorModal  = signal(false);
  authorTotalPosts = signal(0);

  // ── Author posts modal ────────────────────────────────────────────────────
  private allAuthorPostsData = signal<Post[]>([]);
  showAuthorPostsModal       = signal(false);
  private authorPostsPage    = signal(1);

  displayedAuthorPosts = computed(() =>
    this.allAuthorPostsData().slice(0, this.authorPostsPage() * AUTHOR_POSTS_PER_PAGE)
  );

  hasMoreAuthorPosts = computed(() =>
    this.displayedAuthorPosts().length < this.allAuthorPostsData().length
  );

  remainingAuthorCount = computed(() =>
    Math.min(
      this.allAuthorPostsData().length - this.displayedAuthorPosts().length,
      AUTHOR_POSTS_PER_PAGE
    )
  );

  private contentEl: HTMLElement | null = null;
  private adsInitialised = false;

  // ── Computed helpers ──────────────────────────────────────────────────────
  isPostOwner = computed(() => {
    const postData = this.post();
    const userId   = this.currentUserData()?._id;
    if (!postData || !userId) return false;
    const ownerId = (postData.user as any)?._id ?? (postData.user as any);
    return ownerId?.toString() === userId.toString();
  });

  isCommentOwner(comment: DrawerComment): boolean {
    const userId = this.currentUserData()?._id;
    if (!userId) return false;
    return comment.user?.toString() === userId.toString();
  }

  isReplyOwner(reply: DrawerReply): boolean {
    const userId = this.currentUserData()?._id;
    if (!userId) return false;
    return reply.user?.toString() === userId.toString();
  }

  isBookmarked = computed(() => {
    const p = this.post();
    return p ? this.bookmarkedPostIds().has(p._id) : false;
  });

  // ── Author helpers ────────────────────────────────────────────────────────
  get authorName(): string       { return (this.post()?.user as any)?.name     ?? 'Anonymous Author'; }
  get authorInitial(): string    { return this.authorName.charAt(0).toUpperCase(); }
  get authorAvatar(): string     { return (this.post()?.user as any)?.avatar   ?? ''; }
  get authorJoinedDate(): string { return (this.post()?.user as any)?.createdAt ?? ''; }
  get authorEmail(): string      { return (this.post()?.user as any)?.email    ?? ''; }
  get authorBio(): string        { return (this.post()?.user as any)?.bio      ?? ''; }

  // ── Translation controls ──────────────────────────────────────────────────
  readIn(lang: string): void {
    if (this.activeLang() === lang || this.translating()) return;
    const p = this.post();
    if (!p) return;
    this.translating.set(true);
    this.postService.translatePost(p._id, lang)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.translation.set(res.data);
          this.activeLang.set(lang);
          this.translating.set(false);
        },
        error: () => this.translating.set(false),
      });
  }

  resetLang(): void {
    this.translation.set(null);
    this.activeLang.set(null);
  }

  // ── Modal controls ────────────────────────────────────────────────────────
  openAuthorModal(): void  { this.showAuthorModal.set(true);  this.lockScroll(true);  }
  closeAuthorModal(): void { this.showAuthorModal.set(false); this.lockScroll(false); }

  openAuthorPostsModal(): void {
    this.showAuthorModal.set(false);
    this.authorPostsPage.set(1);
    this.showAuthorPostsModal.set(true);
    this.lockScroll(true);
  }

  closeAuthorPostsModal(): void {
    this.showAuthorPostsModal.set(false);
    this.lockScroll(false);
  }

  loadMoreAuthorPosts(): void { this.authorPostsPage.update(p => p + 1); }

  navigateFromAuthorModal(postId: string): void {
    this.closeAuthorPostsModal();
    this.router.navigate(['/blog', postId]);
    if (isPlatformBrowser(this.platformId)) {
      window.scrollTo({ top: 0, behavior: 'instant' });
    }
  }

  private lockScroll(lock: boolean): void {
    if (!isPlatformBrowser(this.platformId)) return;
    this.document.body.style.overflow = lock ? 'hidden' : '';
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Lifecycle
  // ══════════════════════════════════════════════════════════════════════════

  ngOnInit(): void {
    this.route.paramMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(params => {
        const postId = params.get('id');
        if (!postId) { this.router.navigate(['/welcome']); return; }

        // ── Reset all state on route change ───────────────────────────────
        this.isLoading.set(true);
        this.loadError.set(false);
        this.post.set(null);
        this._contentHtml.set('');
        this.translation.set(null);
        this.activeLang.set(null);
        this.translating.set(false);
        this.commentDrawerOpen.set(false);
        this.drawerComments.set([]);
        this.commentFetchedCount.set(0);
        this.totalCommentsCount.set(0);
        this.relatedPosts.set([]);
        this.allAuthorPostsData.set([]);
        this.tableOfContents.set([]);
        this.readingProgress.set(0);
        this.shareMenuOpen.set(false);
        this.showToc.set(false);
        this.showAuthorModal.set(false);
        this.showAuthorPostsModal.set(false);
        this.authorTotalPosts.set(0);
        this.replyingToId.set(null);
        this.replyText.set('');
        this.sessionCommentCount.set(0);
        this.authorFollowersCount.set(0);
        this.isFollowingAuthor.set(false);
        this.authorId.set(null);
        this.contentEl = null;
        this.adsInitialised = false;
        this.lockScroll(false);
        this.stopCarousel();
        this.currentSlide.set(0);

        // ── FIX: Rehydrate from TransferState on browser to prevent flash ─
        // SSR writes the fetched post into TransferState; on the first browser
        // render we read it back so the page is instantly populated without
        // waiting for a second HTTP round-trip.
        if (isPlatformBrowser(this.platformId)) {
          const ssrPost = this.transferState.get<Post | null>(POST_STATE_KEY, null);
          if (ssrPost) {
            this.transferState.remove(POST_STATE_KEY);
            this._applyPost(ssrPost);
            this.isLoading.set(false);
            this._bootstrapPost(ssrPost);
          }
        }

        this.loadPost(postId);
        this.loadShareCount(postId);
      });

    this.restoreLikedIds();
    this.restoreBookmarkedIds();
    this.fetchCurrentUser();

    // Browser-only scroll + keyboard listeners
    if (isPlatformBrowser(this.platformId)) {
      fromEvent(window, 'scroll')
        .pipe(throttleTime(100), takeUntilDestroyed(this.destroyRef))
        .subscribe(() => {
          this.updateReadingProgress();
          this.updateActiveHeading();
          this.updateHeaderVisibility();
        });

      fromEvent<KeyboardEvent>(this.document, 'keydown')
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe(e => {
          if (e.key !== 'Escape') return;
          if (this.showAuthorPostsModal()) { this.closeAuthorPostsModal(); return; }
          if (this.showAuthorModal())      { this.closeAuthorModal();      return; }
          if (this.commentDrawerOpen())    { this.closeCommentDrawer();    return; }
          this.shareMenuOpen.set(false);
          this.showToc.set(false);
        });
    }
  }

  ngAfterViewInit(): void {
    // On browser, if the post was already populated from TransferState or
    // cache before this hook fires, run DOM enrichment now.
    if (isPlatformBrowser(this.platformId) && this.post() && !this.contentEl) {
      this._enrichDom();
    }
  }

  ngOnDestroy(): void {
    this.stopCarousel();
    this.lockScroll(false);
    // Remove the preload link so it doesn't linger with a stale href
    // after SPA navigation to a page that has no featured image.
    if (isPlatformBrowser(this.platformId)) {
      this.document.querySelector('link[data-blog-preload]')?.remove();
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Carousel
  // ══════════════════════════════════════════════════════════════════════════

  private startCarousel(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    this.carouselTimer = setInterval(() => {
      const total = this.carouselImages().length;
      this.currentSlide.update(i => (i + 1) % total);
    }, 5000);
  }

  private stopCarousel(): void {
    if (this.carouselTimer) {
      clearInterval(this.carouselTimer);
      this.carouselTimer = null;
    }
  }

  goToSlide(index: number): void {
    this.currentSlide.set(index);
    this.stopCarousel();
    this.startCarousel();
  }

  prevSlide(): void {
    const total = this.carouselImages().length;
    this.currentSlide.update(i => (i - 1 + total) % total);
    this.stopCarousel();
    this.startCarousel();
  }

  nextSlide(): void {
    const total = this.carouselImages().length;
    this.currentSlide.update(i => (i + 1) % total);
    this.stopCarousel();
    this.startCarousel();
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Post loading
  // ══════════════════════════════════════════════════════════════════════════

  private loadPost(postId: string): void {
    const isBrowser = isPlatformBrowser(this.platformId);

    // ── FIX: If TransferState already populated the post, skip the network
    // request entirely — it was just made by SSR milliseconds ago.
    if (isBrowser && this.post()) {
      // Still kick off background refreshables (comments, related, follow)
      // but the post content is already on screen, no loading state needed.
      return;
    }

    // Serve cached data instantly while fresh data loads in the background
    const cached = this.postCache.getById(postId);
    if (cached) {
      this._applyPost(cached as unknown as Post);
      this.isLoading.set(false);
      this._bootstrapPost(cached as unknown as Post);
    }

    // On SSR: cap at 8 s so a cold API never hangs the server response.
    // On browser: no timeout — let the user's connection decide.
    const request$ = isBrowser
      ? this.postService.getPostById(postId)
      : this.postService.getPostById(postId).pipe(timeout(8000));

    request$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          const postData = res.data;

          // ── FIX: Accept all non-null posts with a recognisable status.
          // The old guard blocked 'pending' posts, causing the error screen
          // to flash for post owners who navigate directly via URL.
          if (!postData || !VISIBLE_STATUSES.has(postData.status)) {
            // If SSR already rendered something, don't wipe the screen.
            if (!cached && !this.post()) {
              this.isLoading.set(false);
              if (isBrowser) this.loadError.set(true);
            }
            return;
          }

          // ── FIX: Write to TransferState on SSR so the browser can rehydrate
          // without a second round-trip (eliminates the "loading flash" on refresh).
          if (!isBrowser) {
            this.transferState.set(POST_STATE_KEY, postData);
          }

          this._applyPost(postData);
          this.isLoading.set(false);
          this.loadError.set(false);

          if (!cached) {
            this._bootstrapPost(postData);
          } else if (isBrowser) {
            // Fresh data updated the signal → [innerHTML] re-renders and
            // destroys injected code-block wrappers. Re-inject after tick.
            setTimeout(() => this._enrichDom(), 50);
          }
        },

        error: (err) => {
          console.error('Post load failed:', err);
          if (isBrowser) {
            this.isLoading.set(false);
            // Only show error when there is genuinely nothing displayed.
            // If TransferState or cache already populated the view, swallow
            // the background-refresh error silently.
            if (!cached && !this.post()) {
              this.loadError.set(true);
            }
          }
          // SSR timeout: leave isLoading=true — the server sends the spinner
          // HTML and the browser re-fetches cleanly on the client side.
        },
      });
  }

  /**
   * Side-effects once post data is available.
   *
   * SSR safety:
   *  • Meta tags + schema → both SSR and browser (crawlers index SSR HTML).
   *  • setInterval (carousel) → browser only (Zone.js hangs SSR).
   *  • setTimeout / DOM work → browser only.
   */
  // Set full post data including content. Always go through here — never call
  // this.post.set() directly with a full post object — so _contentHtml stays in sync.
  private _applyPost(postData: Post): void {
    if (postData.content !== this._contentHtml()) {
      this._contentHtml.set(postData.content ?? '');
    }
    this.post.set(postData);
  }

  private _bootstrapPost(postData: Post): void {
    this.updateMetaTags(postData);
    this.calculateReadingTime(postData);

    if (this.carouselImages().length > 1) {
      this.startCarousel();
    }

    if (!isPlatformBrowser(this.platformId)) return;

    this.restoreSessionCommentCount(postData._id);

    // Defer side-effects that hit the network or DOM until after Angular
    // has painted the initial view (avoids ExpressionChangedAfterChecked).
    setTimeout(() => {
      const aId = (postData.user as any)?._id ?? (postData.user as any);
      if (aId) {
        this.authorId.set(aId.toString());
        this.fetchAuthorFollowData(aId.toString());
      }
      this.addView(postData);
      this.loadRelatedAndAuthorPosts(postData);
    }, 0);

    // ── FIX: Use requestAnimationFrame instead of an arbitrary 300 ms timeout
    // so DOM enrichment runs exactly when the browser has finished painting.
    // Falls back to setTimeout(0) on environments without rAF.
    this._scheduleEnrichDom();
  }

  // ── Schedule DOM enrichment after next paint ───────────────────────────────
  private _scheduleEnrichDom(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    const run = () => {
      // Double-rAF ensures we run after the layout pass that renders [innerHTML]
      requestAnimationFrame(() => {
        requestAnimationFrame(() => this._enrichDom());
      });
    };
    // If document is already interactive/complete, schedule immediately;
    // otherwise wait for DOMContentLoaded (covers hard-refresh edge case).
    if (this.document.readyState !== 'loading') {
      run();
    } else {
      this.document.addEventListener('DOMContentLoaded', run, { once: true });
    }
  }

  // ── Enrich DOM (headings, code buttons, ToC, AdSense) ─────────────────────
  private _enrichDom(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    this.contentEl = this.elementRef.nativeElement.querySelector('.blog-content');
    if (!this.contentEl) return;
    this.generateTableOfContents();
    this.addHeadingIds();
    this.addCodeCopyButtons();
    this.pushAdSense();
  }

  // ── AdSense ───────────────────────────────────────────────────────────────
  private pushAdSense(): void {
    if (!isPlatformBrowser(this.platformId) || this.adsInitialised) return;
    this.adsInitialised = true;
    try {
      const ads: any[] = (window as any).adsbygoogle ?? [];
      (window as any).adsbygoogle = ads;
      ads.push({});
    } catch (_) { /* ignore */ }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Code copy buttons
  // ══════════════════════════════════════════════════════════════════════════

  private addCodeCopyButtons(): void {
    if (!isPlatformBrowser(this.platformId) || !this.contentEl) return;

    const container = this.contentEl;

    const SVG_COPY  = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
    const SVG_CHECK = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;

    const LANG_NAMES: Record<string, string> = {
      js: 'JavaScript', javascript: 'JavaScript', ts: 'TypeScript', typescript: 'TypeScript',
      py: 'Python',     python: 'Python',           java: 'Java',       cpp: 'C++',
      c: 'C',           cs: 'C#',                   html: 'HTML',       css: 'CSS',
      scss: 'SCSS',     json: 'JSON',               xml: 'XML',         bash: 'Bash',
      sh: 'Shell',      shell: 'Shell',             sql: 'SQL',         go: 'Go',
      rust: 'Rust',     php: 'PHP',                 ruby: 'Ruby',       swift: 'Swift',
      kt: 'Kotlin',     kotlin: 'Kotlin',           dart: 'Dart',       yaml: 'YAML',
      yml: 'YAML',      md: 'Markdown',             jsx: 'JSX',         tsx: 'TSX',
      vue: 'Vue',       graphql: 'GraphQL',
    };

    container.querySelectorAll('pre').forEach((pre: HTMLElement) => {
      if (pre.closest('.code-block')) return;

      const codeEl    = pre.querySelector('code');
      const classLang = Array.from(codeEl?.classList ?? [])
        .find(c => c.startsWith('language-'))?.replace('language-', '') ?? '';
      const attrLang  = pre.getAttribute('data-language') ?? pre.getAttribute('data-lang') ?? '';
      const rawLang   = (attrLang || classLang).toLowerCase();
      const langLabel = rawLang || 'code';
      const displayLang = LANG_NAMES[langLabel] ?? langLabel.toUpperCase();

      const dots = this.document.createElement('div');
      dots.className = 'code-block-dots';
      dots.innerHTML = `
        <span class="code-dot code-dot--red"></span>
        <span class="code-dot code-dot--yellow"></span>
        <span class="code-dot code-dot--green"></span>`;

      const langSpan = this.document.createElement('span');
      langSpan.className = 'code-block-lang';
      langSpan.textContent = displayLang;

      const copyBtn = this.document.createElement('button');
      copyBtn.className = 'code-block-copy';
      copyBtn.setAttribute('aria-label', 'Copy code to clipboard');
      copyBtn.innerHTML = `${SVG_COPY} <span>Copy</span>`;

      copyBtn.addEventListener('click', () => {
        const text = (codeEl ?? pre).innerText ?? '';
        navigator.clipboard.writeText(text).then(() => {
          copyBtn.innerHTML = `${SVG_CHECK} <span>Copied!</span>`;
          copyBtn.classList.add('copied');
          setTimeout(() => {
            copyBtn.innerHTML = `${SVG_COPY} <span>Copy</span>`;
            copyBtn.classList.remove('copied');
          }, 2200);
        }).catch(() => { /* clipboard API unavailable */ });
      });

      const header = this.document.createElement('div');
      header.className = 'code-block-header';
      header.appendChild(dots);
      header.appendChild(langSpan);
      header.appendChild(copyBtn);

      const wrapper = this.document.createElement('div');
      wrapper.className = 'code-block';
      if (rawLang) wrapper.setAttribute('data-lang', rawLang);

      pre.parentNode?.insertBefore(wrapper, pre);
      wrapper.appendChild(header);
      wrapper.appendChild(pre);
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Related posts + Author posts
  // ══════════════════════════════════════════════════════════════════════════

  private loadRelatedAndAuthorPosts(currentPost: Post): void {
    const cached = this.postCache.get();
    if (cached?.length) {
      try {
        this._processRelatedAndAuthor(currentPost, cached as unknown as Post[]);
      } catch {
        this.relatedPosts.set([]);
      }
      return;
    }

    this.postService.getAllPost(1, 30)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          const posts = res.data ?? [];
          if (posts.length) {
            this.postCache.set(posts.map((p: Post) => ({ ...p, _ts: Date.now() })));
          }
          this._processRelatedAndAuthor(currentPost, posts);
        },
        error: () => this.relatedPosts.set([]),
      });
  }

  private _processRelatedAndAuthor(currentPost: Post, allPosts: Post[]): void {
    const authorId = (currentPost.user as any)?._id ?? currentPost.user;

    const authorPosts = allPosts
      .filter(p => {
        const pid = (p.user as any)?._id ?? p.user;
        return pid?.toString() === authorId?.toString()
          && p.status === 'published'
          && p._id !== currentPost._id;
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    this.allAuthorPostsData.set(authorPosts);
    this.authorTotalPosts.set(authorPosts.length + 1);

    if (!currentPost.categories?.length) { this.relatedPosts.set([]); return; }

    const catsLower = currentPost.categories.map(c => c.toLowerCase());

    const related = allPosts
      .filter(p =>
        p._id !== currentPost._id &&
        p.status === 'published' &&
        Array.isArray(p.categories) &&
        p.categories.some(c => catsLower.includes(c.toLowerCase()))
      )
      .sort((a, b) => {
        const aM = a.categories.filter(c => catsLower.includes(c.toLowerCase())).length;
        const bM = b.categories.filter(c => catsLower.includes(c.toLowerCase())).length;
        return bM !== aM
          ? bM - aM
          : new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });

    this.relatedPosts.set(related.slice(0, 4));
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Comments
  // ══════════════════════════════════════════════════════════════════════════

  private restoreSessionCommentCount(postId: string): void {
    if (!isPlatformBrowser(this.platformId)) return;
    try {
      const stored = sessionStorage.getItem(`comment_count_${postId}`);
      this.sessionCommentCount.set(stored ? Math.min(parseInt(stored, 10) || 0, SESSION_COMMENT_LIMIT) : 0);
    } catch { }
  }

  openCommentDrawer(): void {
    this.commentText.set('');
    this.commentFeedback.set(null);
    this.drawerComments.set([]);
    this.commentFetchedCount.set(0);
    this.totalCommentsCount.set(this.post()?.commentsCount ?? 0);
    this.commentDrawerOpen.set(true);
    this.lockScroll(true);
    const postId = this.post()?._id;
    if (postId) this.loadComments(postId, 0);
  }

  closeCommentDrawer(): void {
    this.commentDrawerOpen.set(false);
    this.lockScroll(false);
    this.commentText.set('');
    this.commentFeedback.set(null);
    this.replyingToId.set(null);
    this.replyText.set('');
  }

  private loadComments(postId: string, skip: number): void {
    const isFirst = skip === 0;
    isFirst ? this.drawerCommentsLoading.set(true) : this.loadingMoreComments.set(true);

    this.postService.getComments(postId, skip, COMMENT_PAGE_SIZE).subscribe({
      next: (res: any) => {
        const incoming: DrawerComment[] = (res.comments ?? []).map((c: any) => ({
          ...c,
          replies:     c.replies ?? [],
          showReplies: false,
        }));
        const total: number = res.totalComments ?? (skip + incoming.length);
        this.drawerComments.set(isFirst ? incoming : [...this.drawerComments(), ...incoming]);
        this.commentFetchedCount.set(this.commentFetchedCount() + incoming.length);
        this.totalCommentsCount.set(total);
        isFirst ? this.drawerCommentsLoading.set(false) : this.loadingMoreComments.set(false);
      },
      error: () => {
        this.drawerCommentsLoading.set(false);
        this.loadingMoreComments.set(false);
      },
    });
  }

  loadMoreComments(): void {
    const postId = this.post()?._id;
    if (!postId || this.loadingMoreComments() || !this.hasMoreComments()) return;
    this.loadComments(postId, this.commentFetchedCount());
  }

  submitComment(): void {
    const text = this.commentText().trim();
    const p    = this.post();
    if (!text) {
      this.commentFeedback.set({ type: 'error', msg: 'Please write something before posting.' });
      return;
    }
    if (this.commentLimitReached()) {
      this.commentFeedback.set({ type: 'error', msg: `You've reached the ${SESSION_COMMENT_LIMIT}-comment limit for this session.` });
      return;
    }
    if (!p || this.commentSubmitting()) return;
    this.commentSubmitting.set(true);
    this.commentFeedback.set(null);

    this.postService.commentPost(p._id, text, this.currentUserData()?._id).subscribe({
      next: (res: any) => {
        this.commentSubmitting.set(false);
        this.commentText.set('');
        this.commentFeedback.set({ type: 'success', msg: 'Comment posted!' });
        const newCount = this.sessionCommentCount() + 1;
        this.sessionCommentCount.set(newCount);
        if (isPlatformBrowser(this.platformId)) {
          try { sessionStorage.setItem(`comment_count_${p._id}`, String(newCount)); } catch { }
        }
        const newComment: DrawerComment = {
          _id:       res.data?.comment?._id,
          name:      this.currentUserData()?.name ?? 'Anonymous',
          comment:   text,
          user:      this.currentUserData()?._id ?? null,
          createdAt: new Date().toISOString(),
          replies:   [],
          showReplies: false,
        };
        this.drawerComments.set([newComment, ...this.drawerComments()]);
        this.commentFetchedCount.set(this.commentFetchedCount() + 1);
        this.totalCommentsCount.set(this.totalCommentsCount() + 1);
        this.post.set({ ...p, commentsCount: p.commentsCount + 1 });
        setTimeout(() => this.commentFeedback.set(null), 3000);
      },
      error: (err: any) => {
        this.commentSubmitting.set(false);
        this.commentFeedback.set({
          type: 'error',
          msg:  err?.error?.message ?? 'Failed to post comment.',
        });
      },
    });
  }

  deleteComment(comment: DrawerComment, event: Event): void {
    event.stopPropagation();
    const p  = this.post();
    const id = comment._id;
    if (!p || !id || this.deletingCommentId()) return;
    this.deletingCommentId.set(id);

    this.postService.deleteComment(p._id, id).subscribe({
      next: () => {
        this.drawerComments.set(this.drawerComments().filter(c => c._id !== id));
        this.commentFetchedCount.set(Math.max(0, this.commentFetchedCount() - 1));
        this.totalCommentsCount.set(Math.max(0, this.totalCommentsCount() - 1));
        this.post.set({ ...p, commentsCount: Math.max(0, p.commentsCount - 1) });
        this.deletingCommentId.set(null);
      },
      error: () => this.deletingCommentId.set(null),
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Replies
  // ══════════════════════════════════════════════════════════════════════════

  startReply(commentId: string): void {
    if (this.replyingToId() === commentId) {
      this.replyingToId.set(null);
      this.replyText.set('');
    } else {
      this.replyingToId.set(commentId);
      this.replyText.set('');
      this.replyFeedback.set(null);
    }
  }

  cancelReply(): void {
    this.replyingToId.set(null);
    this.replyText.set('');
    this.replyFeedback.set(null);
  }

  submitReply(commentId: string): void {
    const text = this.replyText().trim();
    const p    = this.post();
    if (!text || !p || this.replySubmitting()) return;
    this.replySubmitting.set(true);
    this.replyFeedback.set(null);

    this.postService.addReply(p._id, commentId, text, this.currentUserData()?._id).subscribe({
      next: (res) => {
        this.replySubmitting.set(false);
        this.replyText.set('');
        this.replyingToId.set(null);
        const newReply: DrawerReply = {
          _id:       res.data?.reply?._id,
          name:      this.currentUserData()?.name ?? 'Anonymous',
          comment:   text,
          user:      this.currentUserData()?._id ?? null,
          createdAt: new Date().toISOString(),
        };
        this.drawerComments.set(
          this.drawerComments().map(c => c._id === commentId
            ? { ...c, replies: [...(c.replies ?? []), newReply], showReplies: true }
            : c
          )
        );
      },
      error: (err) => {
        this.replySubmitting.set(false);
        this.replyFeedback.set({
          type: 'error',
          msg:  err?.error?.message ?? 'Failed to post reply.',
        });
        setTimeout(() => this.replyFeedback.set(null), 3000);
      },
    });
  }

  deleteReply(commentId: string, replyId: string, event: Event): void {
    event.stopPropagation();
    const p = this.post();
    if (!p || !replyId || this.deletingReplyId()) return;
    this.deletingReplyId.set(replyId);

    this.postService.deleteReply(p._id, commentId, replyId).subscribe({
      next: () => {
        this.drawerComments.set(
          this.drawerComments().map(c => c._id === commentId
            ? { ...c, replies: (c.replies ?? []).filter(r => r._id !== replyId) }
            : c
          )
        );
        this.deletingReplyId.set(null);
      },
      error: () => this.deletingReplyId.set(null),
    });
  }

  toggleReplies(commentId: string): void {
    this.drawerComments.set(
      this.drawerComments().map(c =>
        c._id === commentId ? { ...c, showReplies: !c.showReplies } : c
      )
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Meta tags + Schema.org (SSR-safe)
  // ══════════════════════════════════════════════════════════════════════════

  private setMeta(attr: 'name' | 'property', key: string, content: string): void {
    if (!this.meta.getTag(`${attr}="${key}"`)) {
      this.meta.addTag({ [attr]: key, content });
    } else {
      this.meta.updateTag({ [attr]: key, content });
    }
  }

  private updateMetaTags(post: Post): void {
    const canonicalUrl = `https://apnainsights.com/blog/${post.slug || post._id}`;
    const desc         = post.description || post.title;
    const image        = post.featuredImage || 'https://apnainsights.com/og-image.png';

    this.titleService.setTitle(`${post.title} | ApnaInsights`);

    // Pending and draft posts must not be indexed
    const robotsValue = (post.status === 'published')
      ? 'index, follow, max-image-preview:large, max-snippet:-1'
      : 'noindex, nofollow';

    this.setMeta('name',     'description',              desc);
    this.setMeta('name',     'author',                   (post.user as any)?.name ?? 'ApnaInsights');
    this.setMeta('name',     'robots',                   robotsValue);
    this.setMeta('property', 'og:site_name',             'ApnaInsights');
    this.setMeta('property', 'og:title',                 post.title);
    this.setMeta('property', 'og:description',           desc);
    this.setMeta('property', 'og:type',                  'article');
    this.setMeta('property', 'og:url',                   canonicalUrl);
    this.setMeta('property', 'og:locale',                'en_IN');
    this.setMeta('property', 'og:image',                 image);
    this.setMeta('property', 'og:image:alt',             post.title);
    this.setMeta('property', 'og:image:width',           '1200');
    this.setMeta('property', 'og:image:height',          '630');
    this.setMeta('name',     'twitter:card',             'summary_large_image');
    this.setMeta('name',     'twitter:site',             '@apnainsights');
    this.setMeta('name',     'twitter:title',            post.title);
    this.setMeta('name',     'twitter:description',      desc);
    this.setMeta('name',     'twitter:image',            image);
    this.setMeta('name',     'twitter:image:alt',        post.title);
    this.setMeta('property', 'article:published_time',   new Date(post.createdAt).toISOString());
    this.setMeta('property', 'article:modified_time',    new Date(post.updatedAt ?? post.createdAt).toISOString());

    // Always clean up stale tags first to prevent accumulation across nav
    let stale: HTMLMetaElement | null;
    while ((stale = this.meta.getTag('property="article:tag"'))) {
      this.meta.removeTagElement(stale);
    }
    if (post.categories?.length) {
      this.setMeta('property', 'article:section', post.categories[0]);
      post.categories.forEach(cat => this.meta.addTag({ property: 'article:tag', content: cat }));
    }

    if ((post.user as any)?.name) {
      this.setMeta('property', 'article:author', (post.user as any).name);
    }

    // Canonical — update in place, never append duplicates
    try {
      let canonical = this.document.querySelector("link[rel='canonical']") as HTMLLinkElement | null;
      if (!canonical) {
        canonical     = this.document.createElement('link') as HTMLLinkElement;
        canonical.rel = 'canonical';
        this.document.head?.appendChild(canonical);
      }
      canonical.href = canonicalUrl;
    } catch (_) {}

    // hreflang for en-IN targeting
    try {
      let hreflang = this.document.querySelector("link[rel='alternate'][hreflang]") as HTMLLinkElement | null;
      if (!hreflang) {
        hreflang = this.document.createElement('link') as HTMLLinkElement;
        this.document.head?.appendChild(hreflang);
      }
      hreflang.setAttribute('rel', 'alternate');
      hreflang.setAttribute('hreflang', 'en-IN');
      hreflang.setAttribute('href', canonicalUrl);
    } catch (_) {}

    // Preload featured image (browser only) — update in place
    if (isPlatformBrowser(this.platformId) && post.featuredImage?.trim()) {
      try {
        let preload = this.document.querySelector("link[rel='preload'][as='image'][data-blog-preload]") as HTMLLinkElement | null;
        if (!preload) {
          preload = this.document.createElement('link') as HTMLLinkElement;
          preload.rel = 'preload';
          preload.as  = 'image';
          preload.setAttribute('data-blog-preload', '');
          this.document.head?.appendChild(preload);
        }
        preload.href = post.featuredImage;
      } catch (_) {}
    }

    this.injectArticleSchema(post);
  }

  private injectArticleSchema(post: Post): void {
    try {
      const postUrl    = `https://apnainsights.com/blog/${post.slug || post._id}`;
      const authorName = (post.user as any)?.name ?? 'Anonymous Author';
      const authorId   = (post.user as any)?._id ?? (post.user as any);
      const wordCount  = (post.content ?? '').replace(/<[^>]*>/g, '').trim().split(/\s+/).length;

      const breadcrumbItems: any[] = [
        { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://apnainsights.com' },
      ];
      if (post.categories?.length) {
        breadcrumbItems.push({
          '@type': 'ListItem', position: 2,
          name: post.categories[0],
          item: `https://apnainsights.com/category/${post.categories[0].toLowerCase()}`,
        });
        breadcrumbItems.push({ '@type': 'ListItem', position: 3, name: post.title, item: postUrl });
      } else {
        breadcrumbItems.push({ '@type': 'ListItem', position: 2, name: post.title, item: postUrl });
      }

      const schemas: any[] = [
        {
          '@context':      'https://schema.org',
          '@type':         'BlogPosting',
          headline:        post.title,
          description:     post.description || post.title,
          inLanguage:      'en-IN',
          wordCount,
          commentCount:    post.commentsCount ?? 0,
          timeRequired:    `PT${Math.ceil(wordCount / 200)}M`,
          image: post.featuredImage
            ? { '@type': 'ImageObject', url: post.featuredImage, caption: post.title, width: 1200, height: 630 }
            : { '@type': 'ImageObject', url: 'https://apnainsights.com/og-image.png', width: 1200, height: 630 },
          datePublished:   new Date(post.createdAt).toISOString(),
          dateModified:    new Date(post.updatedAt ?? post.createdAt).toISOString(),
          author: {
            '@type': 'Person',
            name:    authorName,
            ...(authorId ? { url: `https://apnainsights.com/author/${authorId}` } : {}),
          },
          keywords:        post.categories?.join(', ') || undefined,
          articleSection:  post.categories?.[0] || undefined,
          publisher: {
            '@type': 'Organization',
            name:    'ApnaInsights',
            logo:    { '@type': 'ImageObject', url: 'https://apnainsights.com/logo.png', width: 1024, height: 1024 },
          },
          mainEntityOfPage: { '@type': 'WebPage', '@id': postUrl },
        },
        {
          '@context':      'https://schema.org',
          '@type':         'BreadcrumbList',
          itemListElement: breadcrumbItems,
        },
      ];

      let el = this.document.getElementById('article-schema');
      if (!el) {
        el    = this.document.createElement('script');
        el.id = 'article-schema';
        (el as HTMLScriptElement).type = 'application/ld+json';
        this.document.head?.appendChild(el);
      }
      el.textContent = JSON.stringify(schemas);
    } catch (_) {}
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Views
  // ══════════════════════════════════════════════════════════════════════════

  addView(post: Post): void {
    if (!isPlatformBrowser(this.platformId)) return;
    const key = `viewed_${post._id}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, '1');
    } catch { return; }
    const newViews = post.views + 1;
    this.postService.addView(post._id).subscribe();
    this.post.set({ ...post, views: newViews });
    // Keep PostCache in sync — home-page cards read from it on back-navigation
    this.postCache.patchOne(post._id, { views: newViews });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Reading experience
  // ══════════════════════════════════════════════════════════════════════════

  private calculateReadingTime(post: Post): void {
    const text = (post.content ?? '').replace(/<[^>]*>/g, '');
    this.readingTime.set(Math.max(1, Math.ceil(text.trim().split(/\s+/).length / 200)));
  }

  private generateTableOfContents(): void {
    if (!isPlatformBrowser(this.platformId) || !this.contentEl) return;
    const headings = this.contentEl.querySelectorAll('h2, h3');
    const toc: TableOfContentsItem[] = [];
    headings.forEach((h: Element, i: number) => {
      const id = `heading-${i}`;
      h.id = id;
      toc.push({ id, text: h.textContent || '', level: parseInt(h.tagName[1]) });
    });
    this.tableOfContents.set(toc);
  }

  private addHeadingIds(): void {
    if (!isPlatformBrowser(this.platformId) || !this.contentEl) return;
    this.contentEl.querySelectorAll('h2, h3, h4').forEach((h: Element, i: number) => {
      if (!h.id) h.id = `heading-${i}`;
    });
  }

  scrollToHeading(id: string): void {
    this.document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  scrollToComments(): void {
    this.document.getElementById('comments-section')
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  toggleToc(): void { this.showToc.set(!this.showToc()); }

  private updateReadingProgress(): void {
    if (!this.contentEl || !isPlatformBrowser(this.platformId)) return;
    const el        = this.contentEl;
    const scrollTop = window.scrollY;
    const winH      = window.innerHeight;
    const top       = el.offsetTop;
    const bottom    = top + el.offsetHeight;

    if (scrollTop < top)             { this.readingProgress.set(0);   return; }
    if (scrollTop + winH >= bottom)  { this.readingProgress.set(100); return; }

    const denominator = el.offsetHeight - winH;
    if (denominator <= 0) { this.readingProgress.set(100); return; }

    const pct = ((scrollTop - top) / denominator) * 100;
    this.readingProgress.set(Math.min(Math.max(pct, 0), 100));
  }

  private updateActiveHeading(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    let active = '';
    this.document.querySelectorAll('.blog-content h2, .blog-content h3').forEach((h: Element) => {
      const rect = h.getBoundingClientRect();
      if (rect.top <= 150 && rect.top >= -100) active = h.id;
    });
    this.activeHeadingId.set(active);
  }

  private updateHeaderVisibility(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    const y = window.scrollY;
    if (window.innerWidth >= 768) {
      this.headerHidden.set(false);
      this.lastScrollY = y;
      return;
    }
    if (y < 80) {
      this.headerHidden.set(false);
    } else if (y > this.lastScrollY + 8) {
      this.headerHidden.set(true);
    } else if (y < this.lastScrollY - 4) {
      this.headerHidden.set(false);
    }
    this.lastScrollY = y;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Bookmarks
  // ══════════════════════════════════════════════════════════════════════════

  private restoreBookmarkedIds(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    try {
      const s = localStorage.getItem('apna_bookmarked_posts');
      if (s) this.bookmarkedPostIds.set(new Set(JSON.parse(s)));
    } catch { }
  }

  private persistBookmarkedIds(ids: Set<string>): void {
    if (!isPlatformBrowser(this.platformId)) return;
    try { localStorage.setItem('apna_bookmarked_posts', JSON.stringify([...ids])); } catch { }
  }

  toggleBookmark(): void {
    const p = this.post();
    if (!p) return;
    const s = new Set(this.bookmarkedPostIds());
    s.has(p._id) ? s.delete(p._id) : s.add(p._id);
    this.bookmarkedPostIds.set(s);
    this.persistBookmarkedIds(s);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Share
  // ══════════════════════════════════════════════════════════════════════════

  private shareUrl(): string {
    const p = this.post();
    return p ? `https://apnainsights.com/blog/${p.slug || p._id}` : '';
  }

  private loadShareCount(postId: string): void {
    if (!isPlatformBrowser(this.platformId)) return;
    try {
      const v = localStorage.getItem(`share_count_${postId}`);
      this.shareCount.set(v ? parseInt(v, 10) : 0);
    } catch { }
  }

  private incrementShareCount(): void {
    const p = this.post();
    if (!p) return;
    const n = this.shareCount() + 1;
    this.shareCount.set(n);
    if (!isPlatformBrowser(this.platformId)) return;
    try { localStorage.setItem(`share_count_${p._id}`, String(n)); } catch { }
  }

  toggleShareMenu(): void { this.shareMenuOpen.set(!this.shareMenuOpen()); }

  shareOnTwitter(): void {
    const p = this.post();
    if (!p || !isPlatformBrowser(this.platformId)) return;
    window.open(
      `https://twitter.com/intent/tweet?url=${encodeURIComponent(this.shareUrl())}&text=${encodeURIComponent(p.title)}`,
      '_blank',
    );
    this.incrementShareCount();
    this.shareMenuOpen.set(false);
  }

  shareOnFacebook(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(this.shareUrl())}`, '_blank');
    this.incrementShareCount();
    this.shareMenuOpen.set(false);
  }

  shareOnLinkedIn(): void {
    const p = this.post();
    if (!p || !isPlatformBrowser(this.platformId)) return;
    window.open(
      `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(this.shareUrl())}&title=${encodeURIComponent(p.title)}`,
      '_blank',
    );
    this.incrementShareCount();
    this.shareMenuOpen.set(false);
  }

  shareOnWhatsApp(): void {
    const p = this.post();
    if (!p || !isPlatformBrowser(this.platformId)) return;
    window.open(`https://wa.me/?text=${encodeURIComponent(p.title + ' - ' + this.shareUrl())}`, '_blank');
    this.incrementShareCount();
    this.shareMenuOpen.set(false);
  }

  async copyLink(): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return;
    try {
      await navigator.clipboard.writeText(this.shareUrl());
      this.copyLinkSuccess.set(true);
      this.incrementShareCount();
      setTimeout(() => {
        this.copyLinkSuccess.set(false);
        this.shareMenuOpen.set(false);
      }, 2000);
    } catch { }
  }

  printArticle(): void {
    if (isPlatformBrowser(this.platformId)) window.print();
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Likes
  // ══════════════════════════════════════════════════════════════════════════

  private restoreLikedIds(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    try {
      const s = localStorage.getItem('apna_liked_posts');
      if (s) this.likedPostIds.set(new Set(JSON.parse(s)));
    } catch { }
  }

  private persistLikedIds(ids: Set<string>): void {
    if (!isPlatformBrowser(this.platformId)) return;
    try { localStorage.setItem('apna_liked_posts', JSON.stringify([...ids])); } catch { }
  }

  isLiked(postId: string): boolean { return this.likedPostIds().has(postId); }

  toggleLike(post: Post, event: Event): void {
    event.stopPropagation();
    const liked  = this.isLiked(post._id);
    const newSet = new Set(this.likedPostIds());

    if (liked) {
      newSet.delete(post._id);
      this.likedPostIds.set(newSet);
      this.persistLikedIds(newSet);
      this.post.set({ ...post, likesCount: Math.max(0, post.likesCount - 1) });
      this.postService.unlikePost(post._id).subscribe({
        error: () => {
          newSet.add(post._id);
          this.likedPostIds.set(new Set(newSet));
          this.persistLikedIds(newSet);
          this.post.set({ ...post, likesCount: post.likesCount });
        },
      });
    } else {
      newSet.add(post._id);
      this.likedPostIds.set(newSet);
      this.persistLikedIds(newSet);
      this.post.set({ ...post, likesCount: post.likesCount + 1 });
      this.postService.likePost(post._id).subscribe({
        error: () => {
          newSet.delete(post._id);
          this.likedPostIds.set(new Set(newSet));
          this.persistLikedIds(newSet);
          this.post.set({ ...post, likesCount: post.likesCount });
        },
      });
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Auth / User
  // ══════════════════════════════════════════════════════════════════════════

  get currentUser(): User | null   { return this.currentUserData(); }
  get isLoggedIn(): boolean        { return this.auth.isAuthorized() && !!this.currentUserData(); }
  get loggedInUserName(): string   { return this.currentUserData()?.name ?? 'Anonymous'; }

  private fetchCurrentUser(): void {
    const userId = this.auth.userId();
    if (!userId) return;
    this.userService.getUserById(userId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => this.currentUserData.set(res.data ?? null),
        error: ()   => this.currentUserData.set(null),
      });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Follow
  // ══════════════════════════════════════════════════════════════════════════

  private fetchAuthorFollowData(aId: string): void {
    this.userService.getUserById(aId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.authorFollowersCount.set(res.followersCount ?? 0);
          this.isFollowingAuthor.set(res.isFollowing ?? false);
        },
        error: () => { /* non-critical */ },
      });
  }

  toggleFollow(): void {
    const aId = this.authorId();
    if (!aId || this.followLoading() || !this.isLoggedIn) return;
    this.followLoading.set(true);

    const action$ = this.isFollowingAuthor()
      ? this.userService.unfollowUser(aId)
      : this.userService.followUser(aId);

    action$.subscribe({
      next: (res) => {
        this.authorFollowersCount.set(res.data.followersCount);
        this.isFollowingAuthor.set(res.data.isFollowing);
        this.followLoading.set(false);
        this.userService.invalidate(aId);
      },
      error: () => this.followLoading.set(false),
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Navigation helpers
  // ══════════════════════════════════════════════════════════════════════════

  goBack(): void {
    // If there is no previous in-app navigation (e.g. user arrived directly
    // from an email link), go home instead of doing a no-op history.back().
    const hasPreviousNav = this.router.lastSuccessfulNavigation?.previousNavigation != null;
    if (hasPreviousNav) {
      this.location.back();
    } else {
      this.router.navigate(['/']);
    }
  }

  retryLoad(): void {
    const postId = this.route.snapshot.paramMap.get('id');
    if (!postId) { this.router.navigate(['/']); return; }
    this.isLoading.set(true);
    this.loadError.set(false);
    this.loadPost(postId);
  }

  navigateToBlog(postId: string): void {
    this.router.navigate(['/blog', postId]);
    if (isPlatformBrowser(this.platformId)) {
      window.scrollTo({ top: 0, behavior: 'instant' });
    }
  }

  filterByTag(tag: string): void {
    this.router.navigate(['/category', tag.toLowerCase()]);
    if (isPlatformBrowser(this.platformId)) {
      window.scrollTo({ top: 0, behavior: 'instant' });
    }
  }
}