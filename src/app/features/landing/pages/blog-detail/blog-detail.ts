import {
  AfterViewInit, ChangeDetectionStrategy, Component, DestroyRef, ElementRef, NgZone, OnDestroy, OnInit, PLATFORM_ID, computed, inject, signal
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { environment } from '../../../../../environments/environment';
import { CommonModule, isPlatformBrowser, DOCUMENT, Location } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { fromEvent } from 'rxjs';
import { throttleTime, timeout } from 'rxjs/operators';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Meta, Title, DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { TimeAgoPipe } from '../../../../shared/pipes/time-ago-pipe';
import { TransferState, makeStateKey } from '@angular/core';

import { PostService }    from '../../../post/services/post-service';
import { PostCache }      from '../../../post/services/post-cache';
import { Post }           from '../../../../core/models/post.model';
import { ThemeService }   from '../../../../core/services/theme-service';
import { Auth }           from '../../../../core/services/auth';
import { UserService }    from '../../../user/services/user-service';
import { User }           from '../../../user/models/user.mode';
import { ToastService }   from '../../../../core/services/toast.service';
import { TaxonomyService } from '../../../../core/services/taxonomy.service';
import { ShortsService }  from '../../../shorts/services/shorts.service';
import { VideoShort }     from '../../../shorts/models/video-short.model';
import { MobileBottomNav } from '../../../../shared/mobile-bottom-nav/mobile-bottom-nav';

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
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports:     [RouterLink, CommonModule, FormsModule, TimeAgoPipe, MobileBottomNav],
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
  private shortsService = inject(ShortsService);
  private destroyRef    = inject(DestroyRef);
  private route         = inject(ActivatedRoute);
  private router        = inject(Router);
  private location      = inject(Location);
  readonly auth         = inject(Auth);
  private userService   = inject(UserService);
  private platformId    = inject(PLATFORM_ID);
  private ngZone        = inject(NgZone);
  private meta          = inject(Meta);
  private titleService  = inject(Title);
  private elementRef    = inject(ElementRef);
  private document      = inject(DOCUMENT);
  private sanitizer     = inject(DomSanitizer);
  private transferState = inject(TransferState);
  themeService          = inject(ThemeService);
  private toastService  = inject(ToastService);
  taxonomyService       = inject(TaxonomyService);

  // ── Post state ────────────────────────────────────────────────────────────
  // Read TransferState once at construction so every signal that depends on the
  // SSR post is pre-populated before Angular's first render pass.  That makes
  // ngSkipHydration's DOM-wipe invisible — the re-render is already complete.
  private readonly _initPost: Post | null = isPlatformBrowser(this.platformId)
    ? this.transferState.get<Post | null>(POST_STATE_KEY, null)
    : null;

  post          = signal<Post | null>(this._initPost);
  isLoading     = signal(!this._initPost);
  loadError     = signal(false);
  relatedPosts  = signal<Post[]>([]);
  relatedShorts = signal<VideoShort[]>([]);
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
  private readonly _contentHtml = signal<string>(this._initPost?.content ?? '');

  // ── Translation ────────────────────────────────────────────────────────────
  readonly LANGUAGES = [
    { code: 'hi', label: 'हिंदी',    english: 'Hindi' },
    { code: 'mr', label: 'मराठी',    english: 'Marathi' },
    { code: 'ta', label: 'தமிழ்',    english: 'Tamil' },
    { code: 'te', label: 'తెలుగు',   english: 'Telugu' },
    { code: 'ml', label: 'മലയാളം',  english: 'Malayalam' },
    { code: 'kn', label: 'ಕನ್ನಡ',   english: 'Kannada' },
  ];
  translation = signal<{ title: string; description: string; content: string } | null>(null);
  translating = signal(false);
  activeLang  = signal<string | null>(null);

  // Cache SafeHtml so [innerHTML] doesn't re-render when the HTML string is identical.
  // bypassSecurityTrustHtml creates a new object reference every call — without
  // caching, even a no-op signal update causes Angular to wipe and repaint the DOM.
  private _safeCache: SafeHtml | null = null;
  private _safeCacheKey = '';

  safeContent = computed<SafeHtml>(() => {
    const translated = this.translation();
    const original   = this._contentHtml();
    if (!translated) {
      if (original === this._safeCacheKey && this._safeCache) return this._safeCache;
      this._safeCacheKey = original;
      this._safeCache = this.sanitizer.bypassSecurityTrustHtml(original);
      return this._safeCache;
    }
    return this.sanitizer.bypassSecurityTrustHtml(
      this.mergeTranslatedContent(translated.content, original)
    );
  });

  private mergeTranslatedContent(translated: string, original: string): string {
    if (!translated?.trim() || translated.trim().length < 50) return original;

    const stripTags = (h: string) => h.replace(/<[^>]*>/g, '').trim();

    // ── Step 1: Re-inject media stripped by translation API ───────────────
    let content = translated;
    const mediaRe    = /<figure[\s\S]*?<\/figure>|<img[^>]+\/?>|<video[\s\S]*?<\/video>|<iframe[\s\S]*?<\/iframe>/gi;
    const mediaBlocks = original.match(mediaRe) ?? [];

    if (mediaBlocks.length && !/<img[\s>]/i.test(content)) {
      const pos = content.indexOf('</p>') + 4 || content.length;
      content   = content.slice(0, pos) + mediaBlocks.join('') + content.slice(pos);
    }

    // ── Step 2: Always append original content after last media block ─────
    // Translation APIs frequently truncate long articles. Rather than guessing
    // if truncation occurred, we always append whatever original content follows
    // the last image/figure — this ensures nothing is ever invisible.
    let lastMediaEnd = -1;
    const scanRe = /<figure[\s\S]*?<\/figure>|<img[^>]+\/?>|<video[\s\S]*?<\/video>|<iframe[\s\S]*?<\/iframe>/gi;
    let m: RegExpExecArray | null;
    while ((m = scanRe.exec(original)) !== null) {
      lastMediaEnd = m.index + m[0].length;
    }

    if (lastMediaEnd !== -1) {
      const afterMedia = original.slice(lastMediaEnd).trim();
      if (stripTags(afterMedia).length > 80) {
        // Only append if the translated content doesn't already contain this text
        const afterMediaText  = stripTags(afterMedia).slice(0, 60).toLowerCase();
        const alreadyPresent  = stripTags(content).toLowerCase().includes(afterMediaText);

        if (!alreadyPresent) {
          content +=
            `<div class="translation-remainder">` +
            `<p class="translation-remainder-note"><em>— Continued —</em></p>` +
            afterMedia +
            `</div>`;
        }
      }
    }

    return content;
  }

  // ── Likes / Bookmarks ─────────────────────────────────────────────────────
  likedPostIds      = signal<Set<string>>(new Set());
  bookmarkedPostIds = signal<Set<string>>(new Set());

  // ── MCQ quiz state ────────────────────────────────────────────────────────
  mcqUserAnswers    = signal<Map<number, number>>(new Map());
  mcqSubmitted      = signal(false);
  mcqRevealedAnswers = signal<Set<number>>(new Set());

  readonly MCQ_OPTION_LABELS = ['A', 'B', 'C', 'D'];

  selectMcqAnswer(questionIndex: number, optionIndex: number): void {
    if (this.mcqSubmitted() || this.mcqRevealedAnswers().has(questionIndex)) return;
    this.mcqUserAnswers.update(map => {
      const next = new Map(map);
      next.set(questionIndex, optionIndex);
      return next;
    });
  }

  revealMcqAnswer(qi: number): void {
    this.mcqRevealedAnswers.update(s => new Set([...s, qi]));
  }

  submitMcqAnswers(): void {
    this.mcqSubmitted.set(true);
  }

  resetMcqAnswers(): void {
    this.mcqUserAnswers.set(new Map());
    this.mcqSubmitted.set(false);
    this.mcqRevealedAnswers.set(new Set());
  }

  mcqScore = computed(() => {
    const p = this.post();
    if (!p?.mcqQuestions?.length) return { correct: 0, total: 0 };
    const answers = this.mcqUserAnswers();
    const correct = p.mcqQuestions.filter((q, i) => answers.get(i) === q.correctIndex).length;
    return { correct, total: p.mcqQuestions.length };
  });

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

  minutesLeft = computed(() => {
    const pct   = this.readingProgress();
    const total = this.readingTime();
    if (pct <= 0 || total <= 0) return total;
    if (pct >= 95)              return 0;
    return Math.max(1, Math.ceil(total * (1 - pct / 100)));
  });

  // ── Text resize ───────────────────────────────────────────────────────────
  fontSize = signal<'sm' | 'md' | 'lg'>('md');

  setFontSize(size: 'sm' | 'md' | 'lg'): void {
    this.fontSize.set(size);
    if (isPlatformBrowser(this.platformId)) {
      try { localStorage.setItem('bd_font_size', size); } catch { }
    }
  }

  // ── Trending posts ────────────────────────────────────────────────────────
  trendingPosts = signal<Post[]>([]);

  // ── Image lightbox ────────────────────────────────────────────────────────
  lightboxSrc = signal<string | null>(null);
  lightboxAlt = signal<string>('');

  openLightbox(src: string, alt: string): void {
    this.lightboxSrc.set(src);
    this.lightboxAlt.set(alt);
    this.lockScroll(true);
  }

  closeLightbox(): void {
    this.lightboxSrc.set(null);
    this.lockScroll(false);
  }

  // ── Categories dropdown ───────────────────────────────────────────────────
  showCatDropdown = signal(false);

  readonly ALL_CATEGORIES = computed<string[]>(() => {
    const names = this.taxonomyService.categoryNames();
    return names.length ? names : [
      'Update','News','Sports','Technology','Lifestyle',
      'Education','Health','Business','Entertainment',
      'Social','Village','Cooking','Quotes','Exercise',
    ];
  });

  toggleCatDropdown(): void { this.showCatDropdown.set(!this.showCatDropdown()); }

  navigateToCategory(cat: string): void {
    this.showCatDropdown.set(false);
    this.filterByTag(cat);
  }

  // ── Share ─────────────────────────────────────────────────────────────────
  shareCount      = signal(0);
  shareMenuOpen   = signal(false);
  copyLinkSuccess = signal(false);

  // ── Quote share ───────────────────────────────────────────────────────────
  quotePopover = signal<{ text: string; x: number; y: number } | null>(null);

  // ── Paragraph Reactions ───────────────────────────────────────────────────
  readonly EMOJIS = ['👍', '❤️', '🔥', '💡', '😮'];
  reactions   = signal<Record<number, Record<string, number>>>({});
  myReactions = signal<Record<number, string>>({});
  pickerIdx   = signal<number>(-1);
  pickerPos   = signal<{ x: number; y: number }>({ x: 0, y: 0 });

  // ── Header visibility ─────────────────────────────────────────────────────
  headerHidden    = signal(false);
  showScrollTop   = signal(false);
  private lastScrollY = 0;

  // Show article title in header once user has scrolled 10% into the article
  showHeaderTitle = computed(() => this.readingProgress() > 10);

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
  authorPostsLoading         = signal(false);
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

  /**
   * Returns true when the original post is already written in `lang`,
   * so we can skip the translation API and preserve the original formatting.
   *
   * Hindi and Marathi both use Devanagari, so we need a discriminator:
   *   ळ (U+0933) is very common in Marathi (काळ, वेळ, बोलणे…) but
   *   virtually absent from modern standard Hindi — used as the tiebreaker.
   */
  private isOriginalInLang(lang: string): boolean {
    const text = (this.post()?.title ?? '') + ' ' + (this.post()?.description ?? '');

    const hasDevanagari  = /[ऀ-ॿ]/.test(text);
    const hasMarathiChar = /ळ/.test(text); // ळ — Marathi discriminator

    switch (lang) {
      case 'en': {
        // No Indic script at all → original is English
        const hasIndic = /[ऀ-ॿ஀-௿ఀ-౿ಀ-೿ഀ-ൿ]/.test(text);
        return !hasIndic;
      }
      case 'hi':
        // Devanagari present AND no Marathi-specific ळ → Hindi
        return hasDevanagari && !hasMarathiChar;
      case 'mr':
        // Devanagari present AND ळ found → Marathi
        return hasDevanagari && hasMarathiChar;
      case 'ta': return (text.match(/[஀-௿]/g) ?? []).length >= 3;
      case 'te': return (text.match(/[ఀ-౿]/g) ?? []).length >= 3;
      case 'ml': return (text.match(/[ഀ-ൿ]/g) ?? []).length >= 3;
      case 'kn': return (text.match(/[ಀ-೿]/g) ?? []).length >= 3;
      default:   return false;
    }
  }

  readIn(lang: string): void {
    if (this.translating()) return;
    if (this.activeLang() === lang) return; // already showing this language

    const p = this.post();
    if (!p) return;

    // If the original post is already written in the requested language,
    // always revert to original content — never send it through the translator
    // (wrong source lang would garble text and break HTML formatting).
    if (this.isOriginalInLang(lang)) {
      const wasShowingOriginal = this.translation() === null;
      this.translation.set(null);   // revert to unmodified original
      this.activeLang.set(lang);
      if (wasShowingOriginal) {
        this.toastService.show('Already in this language', 'success');
      }
      return;
    }

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

    const aId = this.authorId();
    if (!aId) return;

    this.authorPostsLoading.set(true);
    this.postService.getPostByUserId(aId, 1, 100)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: res => {
          const currentId = this.post()?._id;
          const posts = (res.data ?? []).filter(
            p => p._id !== currentId && (p.status === 'published' || p.status === 'draft')
          );
          this.allAuthorPostsData.set(posts);
          this.authorTotalPosts.set(posts.length + 1);
          this.authorPostsLoading.set(false);
        },
        error: () => this.authorPostsLoading.set(false),
      });
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
      this.elementRef.nativeElement.scrollTo({ top: 0, behavior: 'instant' });
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
    this.taxonomyService.load().pipe(takeUntilDestroyed(this.destroyRef)).subscribe();

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
        this.relatedShorts.set([]);
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
    this.restoreFontSize();

    // Browser-only scroll + keyboard listeners
    if (isPlatformBrowser(this.platformId)) {
      this.document.body.classList.add('blog-detail-active');

      const host = this.elementRef.nativeElement as HTMLElement;
      fromEvent(host, 'scroll')
        .pipe(throttleTime(100), takeUntilDestroyed(this.destroyRef))
        .subscribe(() => {
          this.updateReadingProgress();
          this.updateActiveHeading();
          this.updateHeaderVisibility();
          const nearBottom = (host.scrollTop + host.clientHeight) >= (host.scrollHeight - 160);
          this.showScrollTop.set(host.scrollTop > 400 && !nearBottom);
        });

      fromEvent<MouseEvent>(this.document, 'click')
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe(e => {
          if (!(e.target as HTMLElement).closest('.cat-dropdown-wrap')) {
            this.showCatDropdown.set(false);
          }
        });

      fromEvent<KeyboardEvent>(this.document, 'keydown')
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe(e => {
          if (e.key !== 'Escape') return;
          if (this.pickerIdx() >= 0)       { this.pickerIdx.set(-1);          return; }
          if (this.lightboxSrc())          { this.closeLightbox();            return; }
          if (this.showAuthorPostsModal()) { this.closeAuthorPostsModal();    return; }
          if (this.showAuthorModal())      { this.closeAuthorModal();         return; }
          if (this.commentDrawerOpen())    { this.closeCommentDrawer();       return; }
          if (this.quotePopover())         { this.quotePopover.set(null);     return; }
          this.shareMenuOpen.set(false);
          this.showCatDropdown.set(false);
          this.showToc.set(false);
        });

      this.initQuoteShare();
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
    this.saveReadingProgress();
    if (isPlatformBrowser(this.platformId)) {
      this.document.body.classList.remove('blog-detail-active');
      this.document.querySelector('link[data-blog-preload]')?.remove();
    }
  }

  private saveReadingProgress(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    const id  = this.post()?._id;
    const pct = this.readingProgress();
    if (!id) return;
    try {
      if (pct >= 90) {
        // Fully read — clear any saved progress so card doesn't show "Continue"
        localStorage.removeItem(`apna_progress_${id}`);
      } else if (pct >= 5) {
        localStorage.setItem(`apna_progress_${id}`, String(Math.round(pct)));
      }
    } catch { /* quota */ }
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
      this.loadRelatedShorts(postData);
      if (postData._id) this.loadReactions(postData._id);
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

  // ── Enrich DOM (headings, code buttons, ToC, AdSense, lightbox) ──────────
  private _enrichDom(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    this.contentEl = this.elementRef.nativeElement.querySelector('.blog-content');
    if (!this.contentEl) return;
    this._stripEdgeNodes();
    this.generateTableOfContents();
    this.addHeadingIds();
    this.addCodeCopyButtons();
    this.wrapTables();
    this.addContentImageLightbox();
    this.pushAdSense();
    this.updateReactionStrips();
  }

  private _stripEdgeNodes(): void {
    if (!this.contentEl) return;
    const isEmpty = (el: Element): boolean => {
      if (el.tagName === 'BR') return true;
      if (el.querySelector('img, iframe, video, canvas')) return false;
      return (el.textContent ?? '').replace(/[ \s]/g, '') === '';
    };
    let first = this.contentEl.firstElementChild;
    while (first && isEmpty(first)) { const n = first.nextElementSibling; first.remove(); first = n; }
    let last = this.contentEl.lastElementChild;
    while (last && isEmpty(last)) { const p = last.previousElementSibling; last.remove(); last = p; }
  }

  private wrapTables(): void {
    if (!this.contentEl) return;
    this.contentEl.querySelectorAll<HTMLTableElement>('table').forEach(table => {
      if (table.closest('.bd-table-wrap')) return;
      const wrap = this.document.createElement('div');
      wrap.className = 'bd-table-wrap';
      table.parentNode?.insertBefore(wrap, table);
      wrap.appendChild(table);
    });
  }

  private addContentImageLightbox(): void {
    if (!this.contentEl) return;
    this.contentEl.querySelectorAll<HTMLImageElement>('img').forEach(img => {
      if (img.closest('a') || img.dataset['lightboxBound']) return;
      img.dataset['lightboxBound'] = '1';
      img.style.cursor = 'zoom-in';
      img.addEventListener('click', () => {
        this.ngZone.run(() => this.openLightbox(img.src, img.alt || ''));
      });
    });
  }

  // ── AdSense ───────────────────────────────────────────────────────────────
  private pushAdSense(): void {
    if (!isPlatformBrowser(this.platformId) || this.adsInitialised) return;
    this.adsInitialised = true;
    try {
      const ads: any[] = (window as any).adsbygoogle ?? [];
      (window as any).adsbygoogle = ads;
      // Push once per <ins> so every ad slot initialises independently
      const slots = this.elementRef.nativeElement.querySelectorAll('ins.adsbygoogle');
      slots.forEach(() => ads.push({}));
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

  private loadRelatedShorts(post: Post): void {
    const category = post.categories?.[0];
    this.shortsService.getShorts(1, 6, category)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: res => this.relatedShorts.set((res.data ?? []).slice(0, 6)),
        error: ()  => this.relatedShorts.set([]),
      });
  }

  shortThumbnail(s: VideoShort): string {
    if (s.thumbnailUrl) return s.thumbnailUrl;
    if (s.youtubeId)    return `https://img.youtube.com/vi/${s.youtubeId}/mqdefault.jpg`;
    return '';
  }

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

    // No cache (direct URL visit) — the /related endpoint now returns both
    // same-category posts AND trending posts (up to 22 total) so both the
    // "Related Stories" and "Must Read / Trending" sections can be populated.
    this.postService.getRelatedPosts(currentPost._id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          const posts = res.data ?? [];
          if (posts.length) {
            this._processRelatedAndAuthor(currentPost, posts);
          } else {
            // Absolute fallback — both sections stay empty, no error thrown
            this.relatedPosts.set([]);
            this.trendingPosts.set([]);
          }
        },
        error: () => {
          this.relatedPosts.set([]);
          this.trendingPosts.set([]);
        },
      });
  }

  private restoreFontSize(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    try {
      const s = localStorage.getItem('bd_font_size');
      if (s === 'sm' || s === 'lg') this.fontSize.set(s);
    } catch { }
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

    // Trending — top 5 published posts by views, excluding current
    const trending = allPosts
      .filter(p => p._id !== currentPost._id && p.status === 'published')
      .sort((a, b) => (b.views ?? 0) - (a.views ?? 0))
      .slice(0, 5);
    this.trendingPosts.set(trending);
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
    if (this.commentDrawerOpen()) {
      // Already loaded — just scroll
      this.document.getElementById('discussion')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      return;
    }
    this.commentText.set('');
    this.commentFeedback.set(null);
    this.drawerComments.set([]);
    this.commentFetchedCount.set(0);
    this.totalCommentsCount.set(this.post()?.commentsCount ?? 0);
    this.commentDrawerOpen.set(true);
    const postId = this.post()?._id;
    if (postId) this.loadComments(postId, 0);
    setTimeout(() => {
      this.document.getElementById('discussion')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 80);
  }

  closeCommentDrawer(): void {
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
        // Keep comment text so user doesn't lose their message on a transient error
        this.commentFeedback.set({
          type: 'error',
          msg:  err?.error?.message ?? 'Failed to post comment. Please try again.',
        });
        setTimeout(() => this.commentFeedback.set(null), 4000);
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

  /** Truncate to ≤155 chars at a word boundary so Google never cuts mid-word. */
  private truncateDesc(text: string, max = 155): string {
    if (!text) return '';
    const clean = text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    if (clean.length <= max) return clean;
    return clean.substring(0, max).replace(/\s+\S*$/, '') + '…';
  }

  private updateMetaTags(post: Post): void {
    const canonicalUrl = `${environment.siteUrl}/blog/${post.slug || post._id}`;
    const isMcq        = post.postType === 'mcq';
    const rawDesc      = post.description || post.title;
    const fullDesc     = isMcq
      ? `${rawDesc} — Test your knowledge with this ${post.mcqQuestions?.length ?? 0}-question MCQ quiz.`
      : rawDesc;
    // Always truncate to 155 chars for the meta tag
    const desc         = this.truncateDesc(fullDesc, 155);
    const image        = post.featuredImage || environment.ogImage;
    const titleSuffix  = isMcq ? ' [MCQ Quiz]' : '';

    this.titleService.setTitle(`${post.title}${titleSuffix} | ApnaInsights`);

    // Pending and draft posts must not be indexed
    // News articles get max-snippet for Top Stories eligibility
    const NEWS_CATS_META = new Set(['News','Sports','Business','Entertainment','Health','Science','Technology']);
    const isNewsMeta = post.categories?.some(c => NEWS_CATS_META.has(c));
    const robotsValue = (post.status === 'published')
      ? `index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1${isNewsMeta ? ', max-image-preview:large' : ''}`
      : 'noindex, nofollow';

    // Keywords — MCQ gets quiz terms; regular posts get categories + tags
    const keywords = isMcq
      ? [post.title, 'MCQ', 'quiz', 'multiple choice', ...(post.categories ?? []), ...(post.tags ?? [])].join(', ')
      : [...(post.categories ?? []), ...(post.tags ?? []), post.title].filter(Boolean).join(', ');

    this.setMeta('name',     'description',              desc);
    this.setMeta('name',     'keywords',                 keywords);
    this.setMeta('name',     'author',                   (post.user as any)?.name ?? 'ApnaInsights');
    this.setMeta('name',     'robots',                   robotsValue);
    this.setMeta('property', 'og:site_name',             'ApnaInsights');
    this.setMeta('property', 'og:title',                 `${post.title}${titleSuffix}`);
    this.setMeta('property', 'og:description',           desc);
    this.setMeta('property', 'og:type',                  'article');
    this.setMeta('property', 'og:url',                   canonicalUrl);
    this.setMeta('property', 'og:locale',                'en_IN');
    this.setMeta('property', 'og:image',                 image);
    this.setMeta('property', 'og:image:alt',             post.title);
    this.setMeta('property', 'og:image:width',           '1200');
    this.setMeta('property', 'og:image:height',          '630');
    this.setMeta('property', 'og:image:type',            image.endsWith('.png') ? 'image/png' : 'image/jpeg');
    this.setMeta('name',     'twitter:card',             'summary_large_image');
    this.setMeta('name',     'twitter:site',             '@apnainsights');
    this.setMeta('name',     'twitter:title',            `${post.title}${titleSuffix}`);
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
      const site       = environment.siteUrl;
      const postUrl    = `${site}/blog/${post.slug || post._id}`;
      const authorName = (post.user as any)?.name ?? 'Anonymous Author';
      const authorId   = (post.user as any)?._id;
      const isMcq      = post.postType === 'mcq';
      const image      = post.featuredImage || environment.ogImage;

      // ── Breadcrumb ───────────────────────────────────────────────────────
      const breadcrumbItems: any[] = [
        { '@type': 'ListItem', position: 1, name: 'Home', item: site },
      ];
      if (post.categories?.length) {
        breadcrumbItems.push({
          '@type': 'ListItem', position: 2,
          name:  post.categories[0],
          item: `${site}/category/${post.categories[0].toLowerCase()}`,
        });
        breadcrumbItems.push({ '@type': 'ListItem', position: 3, name: post.title, item: postUrl });
      } else {
        breadcrumbItems.push({ '@type': 'ListItem', position: 2, name: post.title, item: postUrl });
      }

      // ── Common article fields ─────────────────────────────────────────────
      const plainText    = (post.content ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
      const wordCount    = plainText.split(/\s+/).filter(Boolean).length;
      // articleBody: first ~500 chars of visible text — used for featured snippets
      const articleBody  = plainText.substring(0, 500) + (plainText.length > 500 ? '…' : '');
      const readTimeMins = Math.max(1, Math.ceil(wordCount / 200));
      const keywords     = [
        ...(post.categories ?? []), ...(post.tags ?? []),
        ...(isMcq ? ['MCQ', 'quiz', 'multiple choice'] : []),
      ].filter(Boolean).join(', ');

      const commonFields: any = {
        '@id':            postUrl,
        url:              postUrl,
        headline:         post.title.substring(0, 110),   // Google max: 110 chars
        description:      this.truncateDesc(post.description || post.title, 155),
        inLanguage:       'en-IN',
        isAccessibleForFree: true,
        image: {
          '@type':   'ImageObject',
          '@id':     `${postUrl}#primaryimage`,
          url:       image,
          contentUrl: image,
          width:     1200,
          height:    630,
          caption:   post.title,
        },
        datePublished:  new Date(post.createdAt).toISOString(),
        dateModified:   new Date(post.updatedAt ?? post.createdAt).toISOString(),
        author: {
          '@type': 'Person',
          name:    authorName,
          ...(authorId ? { url: `${site}/author/${authorId}`, '@id': `${site}/author/${authorId}` } : {}),
        },
        publisher:        { '@id': `${site}/#organization` },
        mainEntityOfPage: { '@type': 'WebPage', '@id': postUrl },
        isPartOf:         { '@id': `${site}/#website` },
        ...(keywords ? { keywords } : {}),
        // InteractionStatistic — helps Google show view/like counts in search
        interactionStatistic: [
          {
            '@type':               'InteractionCounter',
            interactionType:       { '@type': 'ReadAction' },
            userInteractionCount:  post.views ?? 0,
          },
          {
            '@type':               'InteractionCounter',
            interactionType:       { '@type': 'LikeAction' },
            userInteractionCount:  post.likesCount ?? 0,
          },
        ],
      };

      // ── Determine the right schema type ──────────────────────────────────
      // NewsArticle → eligible for Google Top Stories & Google News
      const NEWS_CATS = new Set(['News','Sports','Business','Entertainment','Health','Science','Technology']);
      const isNews = !isMcq && post.categories?.some(c => NEWS_CATS.has(c));

      // ── Main schema — Quiz / NewsArticle / BlogPosting ────────────────────
      let mainSchema: any;
      if (isMcq && post.mcqQuestions?.length) {
        mainSchema = {
          '@type': 'Quiz',
          ...commonFields,
          hasPart: post.mcqQuestions.map((q, i) => ({
            '@type':    'Question',
            position:   i + 1,
            text:       q.question,
            acceptedAnswer: {
              '@type': 'Answer',
              text:    q.options[q.correctIndex]?.text ?? '',
              ...(q.explanation ? { comment: { '@type': 'Comment', text: q.explanation } } : {}),
            },
            suggestedAnswer: q.options
              .filter((_, oi) => oi !== q.correctIndex)
              .map(o => ({ '@type': 'Answer', text: o.text })),
          })),
        };
      } else if (isNews) {
        // NewsArticle — required for Top Stories carousel eligibility
        mainSchema = {
          '@type':        ['NewsArticle', 'Article'],  // dual type for max coverage
          ...commonFields,
          articleBody,
          wordCount,
          commentCount:   post.commentsCount ?? 0,
          timeRequired:   `PT${readTimeMins}M`,
          articleSection: post.categories?.[0] || undefined,
          genre:          'News',
          // speakable — tells Google Assistant which parts to read aloud
          speakable: {
            '@type':   'SpeakableSpecification',
            cssSelector: ['h1', '.article-description', '.news-brief'],
          },
        };
      } else {
        mainSchema = {
          '@type':        'BlogPosting',
          ...commonFields,
          articleBody,
          wordCount,
          commentCount:   post.commentsCount ?? 0,
          timeRequired:   `PT${readTimeMins}M`,
          articleSection: post.categories?.[0] || undefined,
        };
      }

      // ── Use @graph (required for multiple schemas in one <script> tag) ────
      const graph = {
        '@context': 'https://schema.org',
        '@graph': [
          mainSchema,
          {
            '@type':         'BreadcrumbList',
            '@id':           `${postUrl}#breadcrumb`,
            itemListElement: breadcrumbItems,
          },
          {
            '@type': 'WebPage',
            '@id':   postUrl,
            url:     postUrl,
            name:    post.title,
            isPartOf:         { '@id': `${site}/#website` },
            primaryImageOfPage: { '@id': `${postUrl}#primaryimage` },
            breadcrumb:       { '@id': `${postUrl}#breadcrumb` },
            datePublished:    new Date(post.createdAt).toISOString(),
            dateModified:     new Date(post.updatedAt ?? post.createdAt).toISOString(),
            inLanguage:       'en-IN',
          },
        ],
      };

      let el = this.document.getElementById('article-schema');
      if (!el) {
        el    = this.document.createElement('script');
        el.id = 'article-schema';
        (el as HTMLScriptElement).type = 'application/ld+json';
        this.document.head?.appendChild(el);
      }
      el.textContent = JSON.stringify(graph);
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

  scrollToTop(): void {
    if (isPlatformBrowser(this.platformId)) this.elementRef.nativeElement.scrollTo({ top: 0, behavior: 'smooth' });
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
    if (!isPlatformBrowser(this.platformId) || !this.post()) return;
    const host = this.elementRef.nativeElement as HTMLElement;
    const scrollTop = host.scrollTop;
    const scrollable = host.scrollHeight - host.clientHeight;
    if (scrollable <= 0) { this.readingProgress.set(0); return; }
    const pct = (scrollTop / scrollable) * 100;
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
    const host = this.elementRef.nativeElement as HTMLElement;
    const y = host.scrollTop;
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
    return p ? `${environment.siteUrl}/blog/${p.slug || p._id}` : '';
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

  async nativeSharePost(): Promise<void> {
    const p = this.post();
    if (!p || !isPlatformBrowser(this.platformId)) return;
    if ('share' in navigator) {
      try {
        await (navigator as any).share({ title: p.title, text: p.description || p.title, url: this.shareUrl() });
        this.incrementShareCount();
      } catch (err: any) {
        if (err?.name !== 'AbortError') this.shareMenuOpen.set(true);
      }
    } else {
      this.shareMenuOpen.set(true);
    }
  }

  shareQuote(): void {
    const q = this.quotePopover();
    const p = this.post();
    if (!q || !p || !isPlatformBrowser(this.platformId)) return;
    const tweet = `"${q.text}" — ${p.title} ${this.shareUrl()}`;
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(tweet)}`, '_blank');
    this.quotePopover.set(null);
    window.getSelection()?.removeAllRanges();
  }

  dismissQuotePopover(): void { this.quotePopover.set(null); }

  private initQuoteShare(): void {
    fromEvent(this.document, 'mouseup')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        const selection = window.getSelection();
        if (!selection || selection.isCollapsed) { this.quotePopover.set(null); return; }
        const text = selection.toString().trim();
        if (text.length < 10 || text.length > 280) { this.quotePopover.set(null); return; }
        const range = selection.getRangeAt(0);
        const contentEl = this.elementRef.nativeElement.querySelector('.blog-content');
        if (!contentEl?.contains(range.commonAncestorContainer)) { this.quotePopover.set(null); return; }
        const rect = range.getBoundingClientRect();
        this.quotePopover.set({
          text,
          x: rect.left + rect.width / 2 + (this.elementRef.nativeElement as HTMLElement).scrollLeft,
          y: rect.top + (this.elementRef.nativeElement as HTMLElement).scrollTop - 52,
        });
      });

    fromEvent(this.document, 'selectionchange')
      .pipe(throttleTime(200), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        const selection = window.getSelection();
        if (!selection || selection.isCollapsed) this.quotePopover.set(null);
      });
  }

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
      this.elementRef.nativeElement.scrollTo({ top: 0, behavior: 'instant' });
    }
  }

  filterByTag(tag: string): void {
    this.router.navigate(['/category', tag.toLowerCase()]);
    if (isPlatformBrowser(this.platformId)) {
      this.elementRef.nativeElement.scrollTo({ top: 0, behavior: 'instant' });
    }
  }

  navigateToAuthor(): void {
    const id = this.authorId();
    if (!id) return;
    this.router.navigate(['/author', id]);
    if (isPlatformBrowser(this.platformId)) {
      this.elementRef.nativeElement.scrollTo({ top: 0, behavior: 'instant' });
    }
  }

  navigateToTag(tag: string): void {
    this.router.navigate(['/tag', tag.toLowerCase()]);
    if (isPlatformBrowser(this.platformId)) {
      this.elementRef.nativeElement.scrollTo({ top: 0, behavior: 'instant' });
    }
  }

  // ── Paragraph Reactions ───────────────────────────────────────────────────

  private loadReactions(postId: string): void {
    this.postService.getReactions(postId).subscribe({
      next: (res) => {
        this.reactions.set(res.data ?? {});
        this.myReactions.set(res.myReactions ?? {});
        setTimeout(() => this.updateReactionStrips(), 0);
      },
      error: () => {},
    });
  }

  private openReactionPicker(idx: number, x: number, y: number): void {
    const pickerW = 220;
    const safeX   = Math.min(x, window.innerWidth - pickerW - 12);
    const pickerH = 56;
    const safeY   = y + pickerH + 12 > window.innerHeight ? y - pickerH - 8 : y + 12;
    this.pickerIdx.set(idx);
    this.pickerPos.set({ x: Math.max(8, safeX), y: safeY });
  }

  reactTo(emoji: string, event: Event): void {
    event.stopPropagation();
    if (!this.auth.isAuthorized()) return;
    const postId  = this.post()?._id ?? '';
    const idx     = this.pickerIdx();
    const current = this.myReactions()[idx];
    const next    = current === emoji ? '' : emoji;

    const r = { ...this.reactions() };
    if (!r[idx]) r[idx] = {};
    if (current) r[idx][current] = Math.max(0, (r[idx][current] ?? 1) - 1);
    if (next)    r[idx][next]    = (r[idx][next] ?? 0) + 1;
    this.reactions.set(r);
    this.myReactions.update(m => ({ ...m, [idx]: next }));
    this.pickerIdx.set(-1);
    setTimeout(() => this.updateReactionStrips(), 0);

    this.postService.addReaction(postId, idx, next).subscribe({
      error: () => this.loadReactions(postId),
    });
  }

  private updateReactionStrips(): void {
    if (!isPlatformBrowser(this.platformId) || !this.contentEl) return;
    this.contentEl.querySelectorAll('.rp-strip').forEach(el => el.remove());

    const paragraphs = Array.from(this.contentEl.querySelectorAll('p'));
    const r          = this.reactions();

    for (const [idxStr, emojis] of Object.entries(r)) {
      const idx  = Number(idxStr);
      const para = paragraphs[idx];
      if (!para) continue;

      const chips = Object.entries(emojis)
        .filter(([, count]) => count > 0)
        .sort(([, a], [, b]) => b - a)
        .map(([em, count]) => {
          const span = document.createElement('span');
          span.className = 'rp-chip';
          span.textContent = `${em} ${count}`;
          return span;
        });

      if (!chips.length) continue;

      const strip = document.createElement('div');
      strip.className = 'rp-strip';
      chips.forEach(c => strip.appendChild(c));
      para.insertAdjacentElement('afterend', strip);
    }
  }

  onContentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;

    // Picker handled by its own (click) + stopPropagation — ignore here
    if (target.closest('.rp-picker')) return;

    // Close open picker on any prose click that isn't the picker itself
    if (this.pickerIdx() >= 0) {
      this.pickerIdx.set(-1);
      return;
    }

    const img = target.closest('figure.inline-img img') as HTMLImageElement | null
              ?? (target.tagName === 'IMG' && target.closest('figure.inline-img') ? target as HTMLImageElement : null);
    if (img) {
      event.preventDefault();
      this.openLightbox(img.src, img.alt || '');
      return;
    }

    // Paragraph reaction picker
    const p = target.closest('p');
    if (p && this.contentEl) {
      const paragraphs = Array.from(this.contentEl.querySelectorAll<HTMLParagraphElement>('p'));
      const idx = paragraphs.indexOf(p as HTMLParagraphElement);
      if (idx >= 0) this.openReactionPicker(idx, event.clientX, event.clientY);
    }
  }
}