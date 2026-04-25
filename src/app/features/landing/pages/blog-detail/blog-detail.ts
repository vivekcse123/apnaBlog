import { Component, inject, signal, OnInit, OnDestroy, DestroyRef,
  PLATFORM_ID, computed, AfterViewInit, ElementRef } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CommonModule, isPlatformBrowser, DOCUMENT, Location } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { fromEvent, timeout } from 'rxjs';
import { throttleTime } from 'rxjs/operators';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Meta, Title, DomSanitizer, SafeHtml } from '@angular/platform-browser';

import { PostService } from '../../../post/services/post-service';
import { PostCache } from '../../../post/services/post-cache';
import { Post } from '../../../../core/models/post.model';
import { ThemeService } from '../../../../core/services/theme-service';
import { Auth } from '../../../../core/services/auth';
import { UserService } from '../../../user/services/user-service';
import { User } from '../../../user/models/user.mode';

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

const COMMENTS_PAGE_SIZE    = 5;
const AUTHOR_POSTS_PER_PAGE = 10;

@Component({
  selector:    'app-blog-detail',
  standalone:  true,
  imports:     [RouterLink, CommonModule, FormsModule],
  templateUrl: './blog-detail.html',
  styleUrl:    './blog-detail.css',
})
export class BlogDetail implements OnInit, AfterViewInit, OnDestroy {

  // ── Services ────────────────────────────────────────────────────────────────
  private postService  = inject(PostService);
  private postCache    = inject(PostCache);
  private destroyRef   = inject(DestroyRef);
  private route        = inject(ActivatedRoute);
  private router       = inject(Router);
  private location     = inject(Location);
  private auth         = inject(Auth);
  private userService  = inject(UserService);
  private platformId   = inject(PLATFORM_ID);
  private meta         = inject(Meta);
  private titleService = inject(Title);
  private elementRef   = inject(ElementRef);
  private document     = inject(DOCUMENT);
  private sanitizer    = inject(DomSanitizer);
  themeService         = inject(ThemeService);

  // ── Post state ──────────────────────────────────────────────────────────────
  post         = signal<Post | null>(null);
  isLoading    = signal(true);
  loadError    = signal(false);
  relatedPosts = signal<Post[]>([]);
  currentYear  = new Date().getFullYear();

  // ── Carousel ─────────────────────────────────────────────────────────────
  currentSlide = signal(0);
  private carouselTimer: ReturnType<typeof setInterval> | null = null;

  carouselImages = computed(() => {
    const p = this.post();
    if (!p) return [];
    const imgs: string[] = [];
    if (p.featuredImage)  imgs.push(p.featuredImage);
    if (p.images?.length) imgs.push(...p.images);
    return imgs;
  });

  // ── Safe HTML content — SSR-safe with fallback ───────────────────────────
  // safeContent = computed<SafeHtml>(() => {
  //   const raw = this.post()?.content ?? '';
  //   try {
  //     const sanitized = this.sanitizer.sanitize(SecurityContext.HTML, raw) ?? '';
  //     return this.sanitizer.bypassSecurityTrustHtml(sanitized);
  //   } catch {
  //     // Domino (SSR) can struggle with complex HTML — return empty and let
  //     // browser re-hydrate with the full content
  //     return this.sanitizer.bypassSecurityTrustHtml('');
  //   }
  // });

  safeContent = computed<SafeHtml>(() => {
    return this.sanitizer.bypassSecurityTrustHtml(this.post()?.content ?? '');
  });

  // ── Likes / Bookmarks ────────────────────────────────────────────────────
  likedPostIds      = signal<Set<string>>(new Set());
  bookmarkedPostIds = signal<Set<string>>(new Set());

  // ── Comments ─────────────────────────────────────────────────────────────
  commentText       = signal('');
  commentSubmitting = signal(false);
  commentFeedback   = signal<{ type: 'success' | 'error'; msg: string } | null>(null);

  allComments        = signal<DrawerComment[]>([]);
  comments           = signal<DrawerComment[]>([]);
  commentsLoading    = signal(false);
  loadingMore        = signal(false);
  deletingCommentId  = signal<string | null>(null);
  private commentsPage = signal(1);

  hasMoreComments = computed(() =>
    this.comments().length < this.allComments().length
  );

  remainingCount = computed(() =>
    Math.min(
      this.allComments().length - this.comments().length,
      COMMENTS_PAGE_SIZE
    )
  );

  // ── Current user ─────────────────────────────────────────────────────────
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

  // ── Computed helpers ──────────────────────────────────────────────────────
  isPostOwner = computed(() => {
    const postData = this.post();
    const userId   = this.currentUserData()?._id;
    if (!postData || !userId) return false;
    const ownerId = (postData.user as any)?._id ?? (postData.user as any);
    return ownerId?.toString() === userId.toString();
  });

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

        // Reset all state on route change
        this.isLoading.set(true);
        this.post.set(null);
        this.loadError.set(false);
        this.allComments.set([]);
        this.comments.set([]);
        this.commentsPage.set(1);
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
        this.authorFollowersCount.set(0);
        this.isFollowingAuthor.set(false);
        this.authorId.set(null);
        this.contentEl = null;
        this.adsInitialised = false;
        this.lockScroll(false);
        this.stopCarousel();
        this.currentSlide.set(0);

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
          this.shareMenuOpen.set(false);
          this.showToc.set(false);
        });
    }
  }

  ngAfterViewInit(): void { /* AdSense is pushed in _bootstrapPost after post renders */ }

  ngOnDestroy(): void {
    this.stopCarousel();
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Carousel
  // ══════════════════════════════════════════════════════════════════════════

  /** Only run setInterval in the browser — Zone.js tracks timers in SSR and
   *  will keep the server response open indefinitely if they are not cleared. */
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
  // NOTE: We intentionally do NOT redirect 24-hex ObjectIds here.
  // Posts with no slug (e.g. Hindi-title posts) only have an _id URL, and the
  // SSR layer (api/ssr.js) already handles the canonical 301 for migrated posts.

  const isBrowser = isPlatformBrowser(this.platformId);

  const cached = this.postCache.getById(postId);
  if (cached) {
    this.post.set(cached as unknown as Post);
    this.isLoading.set(false);
    this._bootstrapPost(cached as unknown as Post, postId);
  }

  // On SSR, cap the wait at 8 s so a sleeping API doesn't hang the server response.
  // If it times out, the server renders the loading-spinner HTML and the client
  // fetches the post fresh — avoiding a hydration mismatch.
  const request$ = isBrowser
    ? this.postService.getPostById(postId)
    : this.postService.getPostById(postId).pipe(timeout(8000));

  request$.pipe(
    takeUntilDestroyed(this.destroyRef),
  ).subscribe({
    next: (res) => {
      const postData = res.data;
      if (!postData || (postData.status !== 'published' && postData.status !== 'draft')) {
        console.error('Invalid post data:', postData);
        // Only replace a cached render with an error if we have no fallback to show.
        if (!cached) {
          this.post.set(null);
          this.isLoading.set(false);
          if (isBrowser) this.loadError.set(true);
        }
        return;
      }
      this.post.set(postData);
      this.isLoading.set(false);

      if (!cached) {
        this._bootstrapPost(postData, postId);
      } else if (isBrowser) {
        // Fresh data just updated the signal → Angular re-renders [innerHTML], which
        // destroys any code-block wrappers injected earlier by addCodeCopyButtons().
        // Re-inject all DOM enhancements after the current render cycle settles.
        setTimeout(() => {
          this.contentEl = this.elementRef.nativeElement.querySelector('.blog-content');
          this.generateTableOfContents();
          this.addHeadingIds();
          this.addCodeCopyButtons();
        }, 50);
      }
    },
    error: (err) => {
      console.error('Post load failed:', err);
      if (isBrowser) {
        this.isLoading.set(false);
        // Only show the error screen if there is no cached post to fall back to.
        // A background refresh failure should not wipe out content that already rendered.
        if (!cached) {
          this.post.set(null);
          this.loadError.set(true);
        }
      }
      // SSR failure/timeout: intentionally leave isLoading=true so the server
      // renders the loading-spinner state. The client hydrates cleanly against
      // that same state and then fetches the post itself.
    }
  });
}

  /**
   * Side-effects that run once post data is available.
   *
   * SSR safety rules applied here:
   *  • Meta tags + schema → run in BOTH SSR and browser (Google crawls SSR HTML).
   *  • setInterval (carousel) → browser only (Zone.js hangs SSR on open timers).
   *  • setTimeout blocks → browser only (DOM queries + user-specific HTTP calls).
   *  • DOM manipulation (ToC, code buttons) → browser only.
   */
 private _bootstrapPost(postData: Post, postId: string): void {
  this.updateMetaTags(postData);
  this.calculateReadingTime(postData);

  if (this.carouselImages().length > 1) {
    this.startCarousel();
  }

  if (!isPlatformBrowser(this.platformId)) return;

  // ✅ REMOVE THIS BLOCK — no longer needed after slug migration
  // if (postData.slug && postId !== postData.slug) {
  //   this.router.navigate(['/blog', postData.slug], { replaceUrl: true });
  // }

  setTimeout(() => {
    const aId = (postData.user as any)?._id ?? (postData.user as any);
    if (aId) {
      this.authorId.set(aId.toString());
      this.fetchAuthorFollowData(aId.toString());
    }
    this.addView(postData);
    this.loadComments(postId);
    this.loadRelatedAndAuthorPosts(postData);
  }, 0);

  setTimeout(() => {
    this.contentEl = this.elementRef.nativeElement.querySelector('.blog-content');
    this.generateTableOfContents();
    this.addHeadingIds();
    this.addCodeCopyButtons();
    this.pushAdSense();
  }, 300);
}

private adsInitialised = false;

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
  // Code copy buttons (browser-only DOM enhancement)
  // ══════════════════════════════════════════════════════════════════════════

  private addCodeCopyButtons(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    const container: HTMLElement | null =
      this.elementRef.nativeElement.querySelector('.blog-content');
    if (!container) return;

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

      // ── Use injected DOCUMENT, not global document ───────────────────────
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
        }).catch(() => { /* clipboard API not available */ });
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
            this.postCache.set(posts.map(p => ({ ...p, _ts: Date.now() })));
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

  private loadComments(postId: string): void {
    this.commentsLoading.set(true);
    this.postService.getComments(postId).subscribe({
      next: (res: any) => {
        const raw = res.comments ?? [];
        const all: DrawerComment[] = raw.map((c: any) => ({
          ...c,
          replies:     c.replies ?? [],
          showReplies: false,
        }));
        this.allComments.set(all);
        this.comments.set(all.slice(0, COMMENTS_PAGE_SIZE));
        this.commentsPage.set(1);
        this.commentsLoading.set(false);
      },
      error: () => this.commentsLoading.set(false),
    });
  }

  loadMoreComments(): void {
    if (this.loadingMore()) return;
    this.loadingMore.set(true);
    const nextPage = this.commentsPage() + 1;
    setTimeout(() => {
      this.comments.set(this.allComments().slice(0, nextPage * COMMENTS_PAGE_SIZE));
      this.commentsPage.set(nextPage);
      this.loadingMore.set(false);
    }, 300);
  }

  submitComment(): void {
    const text = this.commentText().trim();
    const p    = this.post();
    if (!text) {
      this.commentFeedback.set({ type: 'error', msg: 'Please write something before posting.' });
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
        const newComment: DrawerComment = {
          _id:       res.data?.comment?._id,
          name:      this.currentUserData()?.name ?? 'Anonymous',
          comment:   text,
          user:      this.currentUserData()?._id ?? null,
          createdAt: new Date().toISOString(),
        };
        this.allComments.set([newComment, ...this.allComments()]);
        this.comments.set([newComment, ...this.comments()]);
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
        this.allComments.set(this.allComments().filter(c => c._id !== id));
        this.comments.set(this.comments().filter(c => c._id !== id));
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
        const appendReply = (list: DrawerComment[]) =>
          list.map(c => c._id === commentId
            ? { ...c, replies: [...(c.replies ?? []), newReply], showReplies: true }
            : c
          );
        this.allComments.set(appendReply(this.allComments()));
        this.comments.set(appendReply(this.comments()));
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
        const removeReply = (list: DrawerComment[]) =>
          list.map(c => c._id === commentId
            ? { ...c, replies: (c.replies ?? []).filter(r => r._id !== replyId) }
            : c
          );
        this.allComments.set(removeReply(this.allComments()));
        this.comments.set(removeReply(this.comments()));
        this.deletingReplyId.set(null);
      },
      error: () => this.deletingReplyId.set(null),
    });
  }

  toggleReplies(commentId: string): void {
    const toggle = (list: DrawerComment[]) =>
      list.map(c => c._id === commentId ? { ...c, showReplies: !c.showReplies } : c);
    this.allComments.set(toggle(this.allComments()));
    this.comments.set(toggle(this.comments()));
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Meta tags + Schema.org (SSR-safe)
  // ══════════════════════════════════════════════════════════════════════════

 // ADD this private helper above updateMetaTags
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

  this.setMeta('name',     'description',              desc);
  this.setMeta('name',     'author',                   (post.user as any)?.name ?? 'ApnaInsights');
  this.setMeta('name',     'robots',                   'index, follow, max-image-preview:large, max-snippet:-1');
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

  if (post.categories?.length) {
    this.setMeta('property', 'article:section', post.categories[0]);
    let stale: HTMLMetaElement | null;
    while ((stale = this.meta.getTag('property="article:tag"'))) {
      this.meta.removeTagElement(stale);
    }
    post.categories.forEach(cat => this.meta.addTag({ property: 'article:tag', content: cat }));
  }

  if ((post.user as any)?.name) {
    this.setMeta('property', 'article:author', (post.user as any).name);
  }

  // Canonical
  try {
    let canonical = this.document.querySelector("link[rel='canonical']") as HTMLLinkElement | null;
    if (!canonical) {
      canonical     = this.document.createElement('link') as HTMLLinkElement;
      canonical.rel = 'canonical';
      this.document.head?.appendChild(canonical);
    }
    canonical.href = canonicalUrl;
  } catch (_) {}

  // Preload (browser only)
  if (isPlatformBrowser(this.platformId) && post.featuredImage) {
    try {
      const already = this.document.querySelector(`link[rel='preload'][href='${post.featuredImage}']`);
      if (!already) {
        const preload = this.document.createElement('link') as HTMLLinkElement;
        preload.rel   = 'preload';
        preload.as    = 'image';
        preload.href  = post.featuredImage;
        this.document.head?.appendChild(preload);
      }
    } catch (_) {}
  }

  this.injectArticleSchema(post);
}

 private injectArticleSchema(post: Post): void {
  try {
    const postUrl    = `https://apnainsights.com/blog/${post.slug || post._id}`;
    const authorName = (post.user as any)?.name ?? 'Anonymous Author';
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
        '@type':         'BlogPosting',          // ✅ was Article
        headline:        post.title,
        description:     post.description || post.title,
        inLanguage:      'en-IN',                // ✅ new
        wordCount,                               // ✅ new
        commentCount:    post.commentsCount ?? 0,// ✅ new
        timeRequired:    `PT${Math.ceil(wordCount / 200)}M`, // ✅ new
        image: post.featuredImage
          ? { '@type': 'ImageObject', url: post.featuredImage, caption: post.title, width: 1200, height: 630 }
          : { '@type': 'ImageObject', url: 'https://apnainsights.com/og-image.png', width: 1200, height: 630 },
        datePublished:   new Date(post.createdAt).toISOString(),
        dateModified:    new Date(post.updatedAt ?? post.createdAt).toISOString(),
        author:          { '@type': 'Person', name: authorName },
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
    this.postService.addView(post._id).subscribe();
    this.post.set({ ...post, views: post.views + 1 });
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
        error: () => { /* non-critical — silently ignore */ },
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

  goBack(): void { this.location.back(); }

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