import { Component, inject, signal, OnInit, DestroyRef, PLATFORM_ID, computed, AfterViewInit, ElementRef, HostListener } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CommonModule, isPlatformBrowser, DOCUMENT } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { finalize, fromEvent } from 'rxjs';
import { debounceTime, throttleTime } from 'rxjs/operators';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Meta, Title } from '@angular/platform-browser';

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

@Component({
  selector: 'app-blog-detail',
  standalone: true,
  imports: [RouterLink, CommonModule, FormsModule],
  templateUrl: './blog-detail.html',
  styleUrl: './blog-detail.css',
})
export class BlogDetail implements OnInit, AfterViewInit {
  private postService = inject(PostService);
  private destroyRef = inject(DestroyRef);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private auth = inject(Auth);
  private userService = inject(UserService);
  private visitorService = inject(VisitorService);
  private platformId = inject(PLATFORM_ID);
  private meta = inject(Meta);
  private titleService = inject(Title);
  private elementRef = inject(ElementRef);
  private document = inject(DOCUMENT);
  
  themeService = inject(ThemeService);

  post = signal<Post | null>(null);
  isLoading = signal(true);
  relatedPosts = signal<Post[]>([]);
  
  likedPostIds = signal<Set<string>>(new Set());
  bookmarkedPostIds = signal<Set<string>>(new Set());
  commentText = signal('');
  commentSubmitting = signal(false);
  commentFeedback = signal<{ type: 'success' | 'error'; msg: string } | null>(null);
  
  comments = signal<DrawerComment[]>([]);
  commentsLoading = signal(false);
  deletingCommentId = signal<string | null>(null);
  
  private currentUserData = signal<User | null>(null);

  // Advanced Features Signals
  tableOfContents = signal<TableOfContentsItem[]>([]);
  activeHeadingId = signal<string>('');
  readingProgress = signal(0);
  readingTime = signal(0);
  showToc = signal(false);
  shareCount = signal(0);
  shareMenuOpen = signal(false);
  copyLinkSuccess = signal(false);

  isPostOwner = computed(() => {
    const postData = this.post();
    const userId = this.currentUserData()?._id;
    if (!postData || !userId) return false;
    
    const postOwnerId = (postData.user as any)?._id ?? (postData.user as any);
    return postOwnerId?.toString() === userId.toString();
  });

  isBookmarked = computed(() => {
    const postData = this.post();
    if (!postData) return false;
    return this.bookmarkedPostIds().has(postData._id);
  });

 // ✅ AFTER — reacts every time the :id param changes
ngOnInit(): void {
  this.route.paramMap.pipe(
    takeUntilDestroyed(this.destroyRef)
  ).subscribe(params => {
    const postId = params.get('id');

    if (!postId) {
      this.router.navigate(['/welcome']);
      return;
    }

    // Reset state for the new post
    this.isLoading.set(true);
    this.post.set(null);
    this.comments.set([]);
    this.relatedPosts.set([]);
    this.tableOfContents.set([]);
    this.readingProgress.set(0);
    this.shareMenuOpen.set(false);
    this.showToc.set(false);

    this.loadPost(postId);
    this.loadShareCount(postId);
  });

  // These only need to run once — keep outside the paramMap sub
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
  }
}

  ngAfterViewInit(): void {
    if (isPlatformBrowser(this.platformId)) {
      // Small delay to ensure content is rendered
      setTimeout(() => {
        this.generateTableOfContents();
        this.addHeadingIds();
      }, 100);
    }
  }

  private loadPost(postId: string): void {
    this.postService.getPostById(postId).pipe(
      takeUntilDestroyed(this.destroyRef),
      finalize(() => this.isLoading.set(false))
    ).subscribe({
      next: (res) => {
        const postData = res.data;
        if (!postData || postData.status !== 'published') {
          this.router.navigate(['/welcome']);
          return;
        }
        
        this.post.set(postData);
        this.addView(postData);
        this.loadComments(postId);
        this.loadRelatedPosts(postData);
        this.updateMetaTags(postData);
        this.calculateReadingTime(postData);
      },
      error: () => {
        this.router.navigate(['/welcome']);
      },
    });
  }

  private updateMetaTags(post: Post): void {
    // Set page title
    this.titleService.setTitle(`${post.title} | ApnaBlogs`);
    
    // Set meta description
    this.meta.updateTag({ 
      name: 'description', 
      content: post.description || post.title 
    });
    
    // Open Graph tags for social sharing
    this.meta.updateTag({ property: 'og:title', content: post.title });
    this.meta.updateTag({ property: 'og:description', content: post.description || post.title });
    this.meta.updateTag({ property: 'og:type', content: 'article' });
    this.meta.updateTag({ property: 'og:url', content: window.location.href });
    
    if (post.featuredImage) {
      this.meta.updateTag({ property: 'og:image', content: post.featuredImage });
    }
    
    // Twitter Card tags
    this.meta.updateTag({ name: 'twitter:card', content: 'summary_large_image' });
    this.meta.updateTag({ name: 'twitter:title', content: post.title });
    this.meta.updateTag({ name: 'twitter:description', content: post.description || post.title });
    
    if (post.featuredImage) {
      this.meta.updateTag({ name: 'twitter:image', content: post.featuredImage });
    }
  }
  private loadRelatedPosts(currentPost: Post): void {
    if (!currentPost.categories || currentPost.categories.length === 0) {
      this.relatedPosts.set([]);
      return;
    }
    this.postService.getAllPost(1, 100).pipe(
      takeUntilDestroyed(this.destroyRef)
    ).subscribe({
      next: (res) => {
        const allPosts = res.data ?? [];
        const published = allPosts.filter((p: Post) => {

        if (p._id === currentPost._id) return false;
        
        if (p.status !== 'published') return false;
        
        if (!p.categories || !Array.isArray(p.categories) || p.categories.length === 0) {
          return false;
        }
        
        return currentPost.categories.some(category => 
          p.categories.includes(category)
        );
      });
      
      const sorted = published.sort((a, b) => {
        const aMatches = a.categories.filter(cat => 
          currentPost.categories.includes(cat)
        ).length;
        const bMatches = b.categories.filter(cat => 
          currentPost.categories.includes(cat)
        ).length;
        
        if (bMatches !== aMatches) {
          return bMatches - aMatches;
        }
        
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
      
      this.relatedPosts.set(sorted.slice(0, 4));
      
    },
    error: (err) => {
      console.error('Error loading related posts:', err);
      this.relatedPosts.set([]);
    }
  });
}

  private loadComments(postId: string): void {
    this.commentsLoading.set(true);
    this.postService.getComments(postId).subscribe({
      next: (res: any) => {
        this.comments.set(res.comments ?? []);
        this.commentsLoading.set(false);
      },
      error: () => this.commentsLoading.set(false),
    });
  }

  private fetchCurrentUser(): void {
    const userId = this.auth.userId();
    if (!userId) return;

    this.userService.getUserById(userId).pipe(
      takeUntilDestroyed(this.destroyRef)
    ).subscribe({
      next: (res) => this.currentUserData.set(res.data ?? null),
      error: () => this.currentUserData.set(null),
    });
  }

  addView(post: Post): void {
    const key = `viewed_${post._id}`;
    if (sessionStorage.getItem(key)) return;
    
    sessionStorage.setItem(key, '1');
    this.postService.addView(post._id).subscribe();
    
    // Update local post view count
    this.post.set({ ...post, views: post.views + 1 });
  }

  // ══════════════════════════════════════════════════════════════
  // ADVANCED FEATURES
  // ══════════════════════════════════════════════════════════════

  // Reading Time Calculation
  private calculateReadingTime(post: Post): void {
    // Remove HTML tags and count words
    const text = post.content.replace(/<[^>]*>/g, '');
    const wordCount = text.trim().split(/\s+/).length;
    
    // Average reading speed: 200 words per minute
    const minutes = Math.ceil(wordCount / 200);
    this.readingTime.set(minutes);
  }

  // Table of Contents Generation
  private generateTableOfContents(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    
    const contentEl = this.elementRef.nativeElement.querySelector('.blog-content');
    if (!contentEl) return;

    const headings = contentEl.querySelectorAll('h2, h3');
    const toc: TableOfContentsItem[] = [];

    headings.forEach((heading: Element, index: number) => {
      const id = `heading-${index}`;
      heading.id = id;
      
      toc.push({
        id,
        text: heading.textContent || '',
        level: parseInt(heading.tagName.substring(1))
      });
    });

    this.tableOfContents.set(toc);
  }

  private addHeadingIds(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    
    const contentEl = this.elementRef.nativeElement.querySelector('.blog-content');
    if (!contentEl) return;

    const headings = contentEl.querySelectorAll('h2, h3, h4');
    headings.forEach((heading: Element, index: number) => {
      if (!heading.id) {
        heading.id = `heading-${index}`;
      }
    });
  }

  scrollToHeading(headingId: string): void {
    const element = this.document.getElementById(headingId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  toggleToc(): void {
    this.showToc.set(!this.showToc());
  }

  // Reading Progress Bar
  private updateReadingProgress(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    const contentEl = this.elementRef.nativeElement.querySelector('.blog-content');
    if (!contentEl) return;

    const windowHeight = window.innerHeight;
    const documentHeight = this.document.documentElement.scrollHeight;
    const scrollTop = window.scrollY;
    
    const contentTop = contentEl.offsetTop;
    const contentHeight = contentEl.offsetHeight;
    const contentBottom = contentTop + contentHeight;

    if (scrollTop < contentTop) {
      this.readingProgress.set(0);
    } else if (scrollTop + windowHeight >= contentBottom) {
      this.readingProgress.set(100);
    } else {
      const scrolled = scrollTop - contentTop;
      const total = contentHeight - windowHeight;
      const progress = (scrolled / total) * 100;
      this.readingProgress.set(Math.min(Math.max(progress, 0), 100));
    }
  }

  // Active Heading Detection
  private updateActiveHeading(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    const headings = this.document.querySelectorAll('.blog-content h2, .blog-content h3');
    let activeId = '';

    headings.forEach((heading: Element) => {
      const rect = heading.getBoundingClientRect();
      if (rect.top <= 150 && rect.top >= -100) {
        activeId = heading.id;
      }
    });

    this.activeHeadingId.set(activeId);
  }

  // Bookmark Feature
  private restoreBookmarkedIds(): void {
    try {
      const stored = localStorage.getItem('apna_bookmarked_posts');
      if (stored) this.bookmarkedPostIds.set(new Set(JSON.parse(stored)));
    } catch { }
  }

  private persistBookmarkedIds(ids: Set<string>): void {
    try {
      localStorage.setItem('apna_bookmarked_posts', JSON.stringify([...ids]));
    } catch { }
  }

  toggleBookmark(): void {
    const postData = this.post();
    if (!postData) return;

    const newSet = new Set(this.bookmarkedPostIds());
    
    if (newSet.has(postData._id)) {
      newSet.delete(postData._id);
    } else {
      newSet.add(postData._id);
    }
    
    this.bookmarkedPostIds.set(newSet);
    this.persistBookmarkedIds(newSet);
  }

  // Share Features
  private loadShareCount(postId: string): void {
    // Get share count from localStorage (in real app, this would be from backend)
    try {
      const shares = localStorage.getItem(`share_count_${postId}`);
      this.shareCount.set(shares ? parseInt(shares) : 0);
    } catch { }
  }

  private incrementShareCount(): void {
    const postData = this.post();
    if (!postData) return;

    const newCount = this.shareCount() + 1;
    this.shareCount.set(newCount);
    
    try {
      localStorage.setItem(`share_count_${postData._id}`, newCount.toString());
    } catch { }
  }

  toggleShareMenu(): void {
    this.shareMenuOpen.set(!this.shareMenuOpen());
  }

  shareOnTwitter(): void {
    const postData = this.post();
    if (!postData) return;

    const url = encodeURIComponent(window.location.href);
    const text = encodeURIComponent(postData.title);
    window.open(`https://twitter.com/intent/tweet?url=${url}&text=${text}`, '_blank');
    
    this.incrementShareCount();
    this.shareMenuOpen.set(false);
  }

  shareOnFacebook(): void {
    const url = encodeURIComponent(window.location.href);
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${url}`, '_blank');
    
    this.incrementShareCount();
    this.shareMenuOpen.set(false);
  }

  shareOnLinkedIn(): void {
    const postData = this.post();
    if (!postData) return;

    const url = encodeURIComponent(window.location.href);
    const title = encodeURIComponent(postData.title);
    window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${url}&title=${title}`, '_blank');
    
    this.incrementShareCount();
    this.shareMenuOpen.set(false);
  }

  shareOnWhatsApp(): void {
    const postData = this.post();
    if (!postData) return;

    const url = encodeURIComponent(window.location.href);
    const text = encodeURIComponent(`${postData.title} - ${window.location.href}`);
    window.open(`https://wa.me/?text=${text}`, '_blank');
    
    this.incrementShareCount();
    this.shareMenuOpen.set(false);
  }

  async copyLink(): Promise<void> {
    try {
      await navigator.clipboard.writeText(window.location.href);
      this.copyLinkSuccess.set(true);
      this.incrementShareCount();
      
      setTimeout(() => {
        this.copyLinkSuccess.set(false);
        this.shareMenuOpen.set(false);
      }, 2000);
    } catch (err) {
      console.error('Failed to copy link:', err);
    }
  }

  // Print Functionality
  printArticle(): void {
    if (isPlatformBrowser(this.platformId)) {
      window.print();
    }
  }

  // ══════════════════════════════════════════════════════════════
  // EXISTING FEATURES (LIKES, COMMENTS)
  // ══════════════════════════════════════════════════════════════

  private restoreLikedIds(): void {
    try {
      const stored = localStorage.getItem('apna_liked_posts');
      if (stored) this.likedPostIds.set(new Set(JSON.parse(stored)));
    } catch { }
  }

  private persistLikedIds(ids: Set<string>): void {
    try {
      localStorage.setItem('apna_liked_posts', JSON.stringify([...ids]));
    } catch { }
  }

  isLiked(postId: string): boolean {
    return this.likedPostIds().has(postId);
  }

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

  get currentUser(): User | null {
    return this.currentUserData();
  }

  get isLoggedIn(): boolean {
    return this.auth.isAuthorized() && !!this.currentUserData();
  }

  get loggedInUserName(): string {
    return this.currentUserData()?.name ?? 'Anonymous';
  }

  submitComment(): void {
    const text = this.commentText().trim();
    const postData = this.post();
    
    if (!text) {
      this.commentFeedback.set({ type: 'error', msg: 'Please write something before posting.' });
      return;
    }
    
    if (!postData) return;
    if (this.commentSubmitting()) return;

    this.commentSubmitting.set(true);
    this.commentFeedback.set(null);

    const userId: string | undefined = this.currentUserData()?._id ?? undefined;

    this.postService.commentPost(postData._id, text, userId).subscribe({
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
        
        this.comments.set([newComment, ...this.comments()]);
        this.post.set({ ...postData, commentsCount: postData.commentsCount + 1 });

        setTimeout(() => this.commentFeedback.set(null), 3000);
      },
      error: (err: any) => {
        this.commentSubmitting.set(false);
        this.commentFeedback.set({
          type: 'error',
          msg: err?.error?.message ?? 'Failed to post comment.',
        });
      },
    });
  }

  deleteComment(comment: DrawerComment, event: Event): void {
    event.stopPropagation();

    const postData = this.post();
    const commentId = comment._id;

    if (!postData || !commentId) return;
    if (this.deletingCommentId()) return;

    this.deletingCommentId.set(commentId);

    this.postService.deleteComment(postData._id, commentId).subscribe({
      next: () => {
        this.comments.set(
          this.comments().filter(c => c._id !== commentId)
        );

        this.post.set({ 
          ...postData, 
          commentsCount: Math.max(0, postData.commentsCount - 1) 
        });

        this.deletingCommentId.set(null);
      },
      error: (err: any) => {
        console.error('Delete comment failed:', err?.error?.message);
        this.deletingCommentId.set(null);
      },
    });
  }

  goBack(): void {
    this.router.navigate(['/welcome']);
  }

navigateToBlog(postId: string): void {
  this.router.navigate(['/blog', postId]);
  if (isPlatformBrowser(this.platformId)) {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }
}

  filterByTag(tag: string): void {
    this.router.navigate(['/welcome'], { 
      queryParams: { category: tag } 
    });
  }
}