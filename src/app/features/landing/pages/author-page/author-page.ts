import {
  Component, OnInit, inject, signal, computed, DestroyRef, PLATFORM_ID
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CommonModule, DatePipe, isPlatformBrowser } from '@angular/common';
import { Meta, Title } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { PostService } from '../../../post/services/post-service';
import { UserService } from '../../../user/services/user-service';
import { ShortsService } from '../../../shorts/services/shorts.service';
import { Auth } from '../../../../core/services/auth';
import { Post } from '../../../../core/models/post.model';
import { User } from '../../../user/models/user.mode';
import { VideoShort } from '../../../shorts/models/video-short.model';
import { TimeAgoPipe } from '../../../../shared/pipes/time-ago-pipe';

@Component({
  selector: 'app-author-page',
  standalone: true,
  imports: [RouterLink, CommonModule, DatePipe, TimeAgoPipe],
  templateUrl: './author-page.html',
  styleUrl: './author-page.css',
})
export class AuthorPage implements OnInit {
  private route         = inject(ActivatedRoute);
  private router        = inject(Router);
  private postService   = inject(PostService);
  private userService   = inject(UserService);
  private shortsService = inject(ShortsService);
  private auth          = inject(Auth);
  private destroyRef  = inject(DestroyRef);
  private platformId  = inject(PLATFORM_ID);
  private meta        = inject(Meta);
  private titleSvc    = inject(Title);
  private document    = inject(DOCUMENT);

  author          = signal<User | null>(null);
  posts           = signal<Post[]>([]);
  isLoading       = signal(true);
  notFound        = signal(false);
  followersCount  = signal(0);
  followingCount  = signal(0);
  isFollowing     = signal(false);
  followLoading   = signal(false);
  shorts          = signal<VideoShort[]>([]);
  shortsLoading   = signal(false);
  selectedTab     = signal<'posts' | 'shorts' | 'about'>('posts');

  isLoggedIn   = computed(() => this.auth.isAuthorized());
  currentUid   = computed(() => this.auth.userId());
  isOwnProfile = computed(() => !!this.currentUid() && this.currentUid() === (this.author() as any)?._id);

  totalViews = computed(() => this.posts().reduce((s, p) => s + (p.views ?? 0), 0));
  totalLikes = computed(() => this.posts().reduce((s, p) => s + (p.likesCount ?? 0), 0));

  get authorName(): string    { return (this.author() as any)?.name     ?? 'Anonymous'; }
  get authorInitial(): string { return this.authorName.charAt(0).toUpperCase(); }
  get authorAvatar(): string  { return (this.author() as any)?.avatar   ?? ''; }
  get authorBio(): string     { return (this.author() as any)?.bio      ?? ''; }
  get joinedDate(): string    { return (this.author() as any)?.createdAt ?? ''; }
  get authorEmail(): string   { return (this.author() as any)?.email    ?? ''; }

  currentYear = new Date().getFullYear();
  protected readonly Math = Math;

  ngOnInit(): void {
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(params => {
      const id = params.get('id');
      if (!id) { this.router.navigate(['/']); return; }

      this.isLoading.set(true);
      this.notFound.set(false);
      this.author.set(null);
      this.posts.set([]);
      this.followersCount.set(0);
      this.followingCount.set(0);
      this.isFollowing.set(false);
      this.shorts.set([]);

      this.userService.getUserById(id)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (res) => {
            const user = res.data;
            if (!user) { this.notFound.set(true); this.isLoading.set(false); return; }
            this.author.set(user);
            this.followersCount.set((res as any).followersCount ?? 0);
            this.followingCount.set((res as any).followingCount ?? 0);
            this.isFollowing.set((res as any).isFollowing ?? false);
            this.setMeta(user);
            this.loadPosts(id);
            this.loadShorts(id);
          },
          error: () => { this.notFound.set(true); this.isLoading.set(false); },
        });
    });
  }

  private loadShorts(authorId: string): void {
    this.shortsLoading.set(true);
    this.shortsService.getShortsByUser(authorId, 1, 50)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: res => { this.shorts.set(res.data ?? []); this.shortsLoading.set(false); },
        error: ()  => this.shortsLoading.set(false),
      });
  }

  private loadPosts(authorId: string): void {
    this.postService.getPostByUserId(authorId, 1, 100)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.posts.set((res.data ?? []).filter((p: Post) => p.status === 'published' || p.status === 'draft'));
          this.isLoading.set(false);
        },
        error: () => this.isLoading.set(false),
      });
  }

  toggleFollow(): void {
    if (!this.isLoggedIn() || this.isOwnProfile() || this.followLoading()) return;
    this.followLoading.set(true);
    const authorId = (this.author() as any)?._id;
    const action$ = this.isFollowing()
      ? this.userService.unfollowUser(authorId)
      : this.userService.followUser(authorId);

    action$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (res) => {
        this.followersCount.set(res.data?.followersCount ?? this.followersCount());
        this.isFollowing.set(res.data?.isFollowing ?? !this.isFollowing());
        this.followLoading.set(false);
        this.userService.invalidate(authorId);
      },
      error: () => this.followLoading.set(false),
    });
  }

  private setMeta(user: User): void {
    const name = (user as any).name ?? 'Author';
    const bio  = (user as any).bio  ?? `Read all blogs by ${name} on ApnaInsights.`;
    const url  = `https://apnainsights.com/author/${(user as any)._id}`;

    this.titleSvc.setTitle(`${name} — Author | ApnaInsights`);
    this.meta.updateTag({ name: 'description',        content: bio });
    this.meta.updateTag({ name: 'robots',             content: 'index, follow' });
    this.meta.updateTag({ property: 'og:title',       content: `${name} — Author | ApnaInsights` });
    this.meta.updateTag({ property: 'og:description', content: bio });
    this.meta.updateTag({ property: 'og:url',         content: url });
    this.meta.updateTag({ property: 'og:type',        content: 'profile' });

    let canonical = this.document.querySelector('link[rel="canonical"]') as HTMLLinkElement;
    if (!canonical) {
      canonical = this.document.createElement('link');
      canonical.setAttribute('rel', 'canonical');
      this.document.head.appendChild(canonical);
    }
    canonical.setAttribute('href', url);
  }

  navigateToBlog(post: Post): void {
    this.router.navigate(['/blog', (post as any).slug || post._id]);
    if (isPlatformBrowser(this.platformId)) window.scrollTo({ top: 0, behavior: 'instant' });
  }

  readingTime(content: string): number {
    return Math.max(1, Math.ceil(content.replace(/<[^>]*>/g, '').trim().split(/\s+/).length / 200));
  }

  fmtCount(n: number): string {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
    if (n >= 1_000)     return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
    return String(n);
  }
}
