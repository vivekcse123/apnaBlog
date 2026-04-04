import { Component, inject, signal, OnInit, DestroyRef, PLATFORM_ID, computed } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs/operators';
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

@Component({
  selector: 'app-blog-detail',
  standalone: true,
  imports: [RouterLink, CommonModule, FormsModule],
  templateUrl: './blog-detail.html',
  styleUrl: './blog-detail.css',
})
export class BlogDetail implements OnInit {
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
  
  themeService = inject(ThemeService);

  post = signal<Post | null>(null);
  isLoading = signal(true);
  relatedPosts = signal<Post[]>([]);
  
  likedPostIds = signal<Set<string>>(new Set());
  commentText = signal('');
  commentSubmitting = signal(false);
  commentFeedback = signal<{ type: 'success' | 'error'; msg: string } | null>(null);
  
  comments = signal<DrawerComment[]>([]);
  commentsLoading = signal(false);
  deletingCommentId = signal<string | null>(null);
  
  private currentUserData = signal<User | null>(null);

  isPostOwner = computed(() => {
    const postData = this.post();
    const userId = this.currentUserData()?._id;
    if (!postData || !userId) return false;
    
    const postOwnerId = (postData.user as any)?._id ?? (postData.user as any);
    return postOwnerId?.toString() === userId.toString();
  });

  ngOnInit(): void {
    const postId = this.route.snapshot.paramMap.get('id');
    
    if (!postId) {
      this.router.navigate(['/welcome']);
      return;
    }

    // Track visit
    if (isPlatformBrowser(this.platformId)) {
      const path = window.location.pathname;
      this.visitorService.trackVisit(path);
    }

    this.loadPost(postId);
    this.restoreLikedIds();
    this.fetchCurrentUser();
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
    const category = currentPost.categories[0];
    if (!category) return;

    this.postService.getAllPost(1, 20).pipe(
      takeUntilDestroyed(this.destroyRef)
    ).subscribe({
      next: (res) => {
        const published = (res.data ?? []).filter((p: Post) => 
          p.status === 'published' && 
          p._id !== currentPost._id &&
          p.categories.includes(category)
        );
        this.relatedPosts.set(published.slice(0, 4));
      },
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
    this.router.navigate(['/welcome/blog', postId]);
  }
}