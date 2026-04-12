import { Component, inject, signal, OnInit, DestroyRef, PLATFORM_ID, computed, AfterViewInit, ElementRef } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CommonModule, isPlatformBrowser, DOCUMENT } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { finalize, fromEvent } from 'rxjs';
import { throttleTime } from 'rxjs/operators';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Meta, Title, DomSanitizer, SafeHtml } from '@angular/platform-browser';

import { PostService } from '../../../post/services/post-service';
import { Post } from '../../../../core/models/post.model';
import { ThemeService } from '../../../../core/services/theme-service';
import { Auth } from '../../../../core/services/auth';
import { UserService } from '../../../user/services/user-service';
import { User } from '../../../user/models/user.mode';
import { VisitorService } from '../../../../core/services/visitor';

interface DrawerComment {
  _id?: string;
  name: string;
  comment: string;
  user: string | null;
  createdAt: string;
}

interface TableOfContentsItem {
  id: string;
  text: string;
  level: number;
}

const COMMENTS_PAGE_SIZE    = 5;
const AUTHOR_POSTS_PER_PAGE = 10;

@Component({
  selector: 'app-blog-detail',
  standalone: true,
  imports: [RouterLink, CommonModule, FormsModule],
  templateUrl: './blog-detail.html',
  styleUrl: './blog-detail.css',
})
export class BlogDetail implements OnInit, AfterViewInit {
  private postService    = inject(PostService);
  private destroyRef     = inject(DestroyRef);
  private route          = inject(ActivatedRoute);
  private router         = inject(Router);
  private auth           = inject(Auth);
  private userService    = inject(UserService);
  private visitorService = inject(VisitorService);
  private platformId     = inject(PLATFORM_ID);
  private meta           = inject(Meta);
  private titleService   = inject(Title);
  private elementRef     = inject(ElementRef);
  private document       = inject(DOCUMENT);
  private sanitizer      = inject(DomSanitizer);
  themeService           = inject(ThemeService);

  post         = signal<Post | null>(null);
  isLoading    = signal(true);
  relatedPosts = signal<Post[]>([]);

  safeContent = computed<SafeHtml>(() =>
    this.sanitizer.bypassSecurityTrustHtml(this.post()?.content ?? '')
  );

  likedPostIds      = signal<Set<string>>(new Set());
  bookmarkedPostIds = signal<Set<string>>(new Set());

  commentText       = signal('');
  commentSubmitting = signal(false);
  commentFeedback   = signal<{ type: 'success' | 'error'; msg: string } | null>(null);

  public allComments   = signal<DrawerComment[]>([]);
  comments             = signal<DrawerComment[]>([]);
  commentsLoading      = signal(false);
  loadingMore          = signal(false);
  deletingCommentId    = signal<string | null>(null);
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

  private currentUserData = signal<User | null>(null);

  tableOfContents = signal<TableOfContentsItem[]>([]);
  activeHeadingId = signal<string>('');
  readingProgress = signal(0);
  readingTime     = signal(0);
  showToc         = signal(false);

  shareCount      = signal(0);
  shareMenuOpen   = signal(false);
  copyLinkSuccess = signal(false);

  /* ── Author profile modal ── */
  showAuthorModal  = signal(false);
  authorTotalPosts = signal(0);

  /* ── Author posts modal — no extra API call, reuses getAllPost data ── */
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

  /* ── Author helpers ── */
  get authorName(): string       { return (this.post()?.user as any)?.name ?? 'ApnaInsights'; }
  get authorInitial(): string    { return this.authorName.charAt(0).toUpperCase(); }
  get authorJoinedDate(): string { return (this.post()?.user as any)?.createdAt ?? ''; }
  get authorEmail(): string      { return (this.post()?.user as any)?.email ?? ''; }
  get authorBio(): string        { return (this.post()?.user as any)?.bio ?? ''; }

  /* ── Modal controls ── */
  openAuthorModal(): void { this.showAuthorModal.set(true); this.lockScroll(true); }
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
    if (isPlatformBrowser(this.platformId)) window.scrollTo({ top: 0, behavior: 'instant' });
  }

  private lockScroll(lock: boolean): void {
    if (!isPlatformBrowser(this.platformId)) return;
    this.document.body.style.overflow = lock ? 'hidden' : '';
  }

  ngOnInit(): void {
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(params => {
      const postId = params.get('id');
      if (!postId) { this.router.navigate(['/welcome']); return; }

      this.isLoading.set(true);
      this.post.set(null);
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
      this.contentEl = null;
      this.lockScroll(false);

      this.loadPost(postId);
      this.loadShareCount(postId);
    });

    this.restoreLikedIds();
    this.restoreBookmarkedIds();
    this.fetchCurrentUser();

    if (isPlatformBrowser(this.platformId)) {
      fromEvent(window, 'scroll')
        .pipe(throttleTime(100), takeUntilDestroyed(this.destroyRef))
        .subscribe(() => {
          this.updateReadingProgress();
          this.updateActiveHeading();
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

  ngAfterViewInit(): void {}

  private loadPost(postId: string): void {
    this.postService.getPostById(postId).pipe(
      takeUntilDestroyed(this.destroyRef),
      finalize(() => this.isLoading.set(false))
    ).subscribe({
      next: (res) => {
        const postData = res.data;
        if (!postData || postData.status !== 'published') {
          this.router.navigate(['/welcome']); return;
        }
        this.post.set(postData);
        this.addView(postData);
        this.loadComments(postId);
        this.loadRelatedAndAuthorPosts(postData);
        this.updateMetaTags(postData);
        this.calculateReadingTime(postData);

        if (isPlatformBrowser(this.platformId)) {
          setTimeout(() => {
            this.contentEl = this.elementRef.nativeElement.querySelector('.blog-content');
            this.generateTableOfContents();
            this.addHeadingIds();
          }, 300);
        }
      },
      error: () => this.router.navigate(['/welcome']),
    });
  }

  /* One API call — populates related posts AND all author posts with zero duplication */
  private loadRelatedAndAuthorPosts(currentPost: Post): void {
    this.postService.getAllPost(1, 100).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (res) => {
        const allPosts: Post[] = res.data ?? [];
        const authorId = (currentPost.user as any)?._id ?? currentPost.user;

        /* Author posts (newest first, current article excluded) */
        const authorPosts = allPosts
          .filter(p => {
            const pid = (p.user as any)?._id ?? p.user;
            return pid?.toString() === authorId?.toString()
              && p.status === 'published'
              && p._id !== currentPost._id;
          })
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

        this.allAuthorPostsData.set(authorPosts);
        this.authorTotalPosts.set(authorPosts.length + 1); /* +1 for the current post */

        /* Related posts */
        if (!currentPost.categories?.length) { this.relatedPosts.set([]); return; }

        const related = allPosts
          .filter(p =>
            p._id !== currentPost._id &&
            p.status === 'published' &&
            Array.isArray(p.categories) &&
            p.categories.some(c => currentPost.categories.includes(c))
          )
          .sort((a, b) => {
            const aM = a.categories.filter(c => currentPost.categories.includes(c)).length;
            const bM = b.categories.filter(c => currentPost.categories.includes(c)).length;
            return bM !== aM ? bM - aM : new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
          });
        this.relatedPosts.set(related.slice(0, 4));
      },
      error: () => this.relatedPosts.set([])
    });
  }

  private loadComments(postId: string): void {
    this.commentsLoading.set(true);
    this.postService.getComments(postId).subscribe({
      next: (res: any) => {
        const all: DrawerComment[] = res.comments ?? [];
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

  private updateMetaTags(post: Post): void {
    const canonicalUrl = `https://www.apnainsights.com/blog/${post._id}`;
    this.titleService.setTitle(`${post.title} | ApnaInsights`);
    this.meta.updateTag({ name: 'description',        content: post.description || post.title });
    this.meta.updateTag({ property: 'og:title',       content: post.title });
    this.meta.updateTag({ property: 'og:description', content: post.description || post.title });
    this.meta.updateTag({ property: 'og:type',        content: 'article' });
    this.meta.updateTag({ property: 'og:url',         content: canonicalUrl });
    this.meta.updateTag({ name: 'twitter:card',        content: 'summary_large_image' });
    this.meta.updateTag({ name: 'twitter:title',       content: post.title });
    this.meta.updateTag({ name: 'twitter:description', content: post.description || post.title });
    if (post.featuredImage) {
      this.meta.updateTag({ property: 'og:image',  content: post.featuredImage });
      this.meta.updateTag({ name: 'twitter:image', content: post.featuredImage });
    }
    if (isPlatformBrowser(this.platformId)) {
      let canonical = this.document.querySelector("link[rel='canonical']") as HTMLLinkElement;
      if (!canonical) {
        canonical = this.document.createElement('link') as HTMLLinkElement;
        canonical.rel = 'canonical';
        this.document.head.appendChild(canonical);
      }
      canonical.href = canonicalUrl;
      if (post.featuredImage) {
        const already = this.document.querySelector(`link[rel='preload'][href='${post.featuredImage}']`);
        if (!already) {
          const preload = this.document.createElement('link') as HTMLLinkElement;
          preload.rel = 'preload'; preload.as = 'image'; preload.href = post.featuredImage;
          this.document.head.appendChild(preload);
        }
      }
    }
    this.injectArticleSchema(post);
  }

  private injectArticleSchema(post: Post): void {
    if (!isPlatformBrowser(this.platformId)) return;
    const schema = {
      '@context': 'https://schema.org', '@type': 'Article',
      'headline': post.title, 'description': post.description,
      'image': post.featuredImage, 'datePublished': post.createdAt,
      'author': { '@type': 'Person', 'name': (post.user as any)?.name ?? 'ApnaInsights' },
      'publisher': {
        '@type': 'Organization', 'name': 'ApnaInsights',
        'logo': { '@type': 'ImageObject', 'url': 'https://www.apnainsights.com/logo.png', 'width': 497, 'height': 497 }
      },
      'mainEntityOfPage': `https://www.apnainsights.com/blog/${post._id}`
    };
    let el = this.document.getElementById('article-schema');
    if (!el) {
      el = this.document.createElement('script');
      el.id = 'article-schema';
      (el as HTMLScriptElement).type = 'application/ld+json';
      this.document.head.appendChild(el);
    }
    el.textContent = JSON.stringify(schema);
  }

  addView(post: Post): void {
    const key = `viewed_${post._id}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, '1');
    this.postService.addView(post._id).subscribe();
    this.post.set({ ...post, views: post.views + 1 });
  }

  private calculateReadingTime(post: Post): void {
    const text = post.content.replace(/<[^>]*>/g, '');
    this.readingTime.set(Math.ceil(text.trim().split(/\s+/).length / 200));
  }

  private generateTableOfContents(): void {
    if (!isPlatformBrowser(this.platformId) || !this.contentEl) return;
    const headings = this.contentEl.querySelectorAll('h2, h3');
    const toc: TableOfContentsItem[] = [];
    headings.forEach((h: Element, i: number) => {
      const id = `heading-${i}`; h.id = id;
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

  toggleToc(): void { this.showToc.set(!this.showToc()); }

  private updateReadingProgress(): void {
    if (!this.contentEl || !isPlatformBrowser(this.platformId)) return;
    const el = this.contentEl as HTMLElement;
    const scrollTop = window.scrollY, winH = window.innerHeight;
    const top = el.offsetTop, bottom = top + el.offsetHeight;
    if (scrollTop < top)            { this.readingProgress.set(0);   return; }
    if (scrollTop + winH >= bottom) { this.readingProgress.set(100); return; }
    const pct = ((scrollTop - top) / (el.offsetHeight - winH)) * 100;
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

  private restoreBookmarkedIds(): void {
    try {
      const s = localStorage.getItem('apna_bookmarked_posts');
      if (s) this.bookmarkedPostIds.set(new Set(JSON.parse(s)));
    } catch { }
  }

  private persistBookmarkedIds(ids: Set<string>): void {
    try { localStorage.setItem('apna_bookmarked_posts', JSON.stringify([...ids])); } catch { }
  }

  toggleBookmark(): void {
    const p = this.post(); if (!p) return;
    const s = new Set(this.bookmarkedPostIds());
    s.has(p._id) ? s.delete(p._id) : s.add(p._id);
    this.bookmarkedPostIds.set(s);
    this.persistBookmarkedIds(s);
  }

  private shareUrl(): string {
    const p = this.post();
    return p ? `https://www.apnainsights.com/blog/${p._id}` : '';
  }

  private loadShareCount(postId: string): void {
    try {
      const v = localStorage.getItem(`share_count_${postId}`);
      this.shareCount.set(v ? parseInt(v) : 0);
    } catch { }
  }

  private incrementShareCount(): void {
    const p = this.post(); if (!p) return;
    const n = this.shareCount() + 1;
    this.shareCount.set(n);
    try { localStorage.setItem(`share_count_${p._id}`, String(n)); } catch { }
  }

  toggleShareMenu(): void { this.shareMenuOpen.set(!this.shareMenuOpen()); }

  shareOnTwitter(): void {
    const p = this.post(); if (!p) return;
    window.open(`https://twitter.com/intent/tweet?url=${encodeURIComponent(this.shareUrl())}&text=${encodeURIComponent(p.title)}`, '_blank');
    this.incrementShareCount(); this.shareMenuOpen.set(false);
  }

  shareOnFacebook(): void {
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(this.shareUrl())}`, '_blank');
    this.incrementShareCount(); this.shareMenuOpen.set(false);
  }

  shareOnLinkedIn(): void {
    const p = this.post(); if (!p) return;
    window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(this.shareUrl())}&title=${encodeURIComponent(p.title)}`, '_blank');
    this.incrementShareCount(); this.shareMenuOpen.set(false);
  }

  shareOnWhatsApp(): void {
    const p = this.post(); if (!p) return;
    window.open(`https://wa.me/?text=${encodeURIComponent(p.title + ' - ' + this.shareUrl())}`, '_blank');
    this.incrementShareCount(); this.shareMenuOpen.set(false);
  }

  async copyLink(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.shareUrl());
      this.copyLinkSuccess.set(true);
      this.incrementShareCount();
      setTimeout(() => { this.copyLinkSuccess.set(false); this.shareMenuOpen.set(false); }, 2000);
    } catch { }
  }

  printArticle(): void {
    if (isPlatformBrowser(this.platformId)) window.print();
  }

  private restoreLikedIds(): void {
    try {
      const s = localStorage.getItem('apna_liked_posts');
      if (s) this.likedPostIds.set(new Set(JSON.parse(s)));
    } catch { }
  }

  private persistLikedIds(ids: Set<string>): void {
    try { localStorage.setItem('apna_liked_posts', JSON.stringify([...ids])); } catch { }
  }

  isLiked(postId: string): boolean { return this.likedPostIds().has(postId); }

  toggleLike(post: Post, event: Event): void {
    event.stopPropagation();
    const liked = this.isLiked(post._id);
    const newSet = new Set(this.likedPostIds());
    if (liked) {
      newSet.delete(post._id);
      this.likedPostIds.set(newSet);
      this.persistLikedIds(newSet);
      this.post.set({ ...post, likesCount: Math.max(0, post.likesCount - 1) });
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

  get currentUser(): User | null { return this.currentUserData(); }
  get isLoggedIn(): boolean      { return this.auth.isAuthorized() && !!this.currentUserData(); }
  get loggedInUserName(): string { return this.currentUserData()?.name ?? 'Anonymous'; }

  private fetchCurrentUser(): void {
    const userId = this.auth.userId();
    if (!userId) return;
    this.userService.getUserById(userId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (res) => this.currentUserData.set(res.data ?? null),
      error: ()   => this.currentUserData.set(null),
    });
  }

  submitComment(): void {
    const text = this.commentText().trim();
    const p    = this.post();
    if (!text) { this.commentFeedback.set({ type: 'error', msg: 'Please write something before posting.' }); return; }
    if (!p || this.commentSubmitting()) return;
    this.commentSubmitting.set(true);
    this.commentFeedback.set(null);
    this.postService.commentPost(p._id, text, this.currentUserData()?._id).subscribe({
      next: (res: any) => {
        this.commentSubmitting.set(false);
        this.commentText.set('');
        this.commentFeedback.set({ type: 'success', msg: 'Comment posted!' });
        const newComment: DrawerComment = {
          _id: res.data?.comment?._id,
          name: this.currentUserData()?.name ?? 'Anonymous',
          comment: text,
          user: this.currentUserData()?._id ?? null,
          createdAt: new Date().toISOString(),
        };
        this.allComments.set([newComment, ...this.allComments()]);
        this.comments.set([newComment, ...this.comments()]);
        this.post.set({ ...p, commentsCount: p.commentsCount + 1 });
        setTimeout(() => this.commentFeedback.set(null), 3000);
      },
      error: (err: any) => {
        this.commentSubmitting.set(false);
        this.commentFeedback.set({ type: 'error', msg: err?.error?.message ?? 'Failed to post comment.' });
      },
    });
  }

  deleteComment(comment: DrawerComment, event: Event): void {
    event.stopPropagation();
    const p = this.post(); const id = comment._id;
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

  goBack(): void { this.router.navigate(['/welcome']); }

  navigateToBlog(postId: string): void {
    this.router.navigate(['/blog', postId]);
    if (isPlatformBrowser(this.platformId)) window.scrollTo({ top: 0, behavior: 'instant' });
  }

  filterByTag(tag: string): void {
    this.router.navigate(['/welcome'], { queryParams: { category: tag } });
  }
}