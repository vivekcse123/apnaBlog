import {
  ChangeDetectionStrategy, Component, DestroyRef, OnInit, PLATFORM_ID, computed, inject, signal
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { environment } from '../../../../../environments/environment';
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
import { MobileBottomNav } from '../../../../shared/mobile-bottom-nav/mobile-bottom-nav';

@Component({
  selector: 'app-author-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, CommonModule, DatePipe, TimeAgoPipe, MobileBottomNav],
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

  // Accurate stats from backend
  totalViewsFromApi  = signal(0);
  totalLikesFromApi  = signal(0);
  shortsCountFromApi = signal(0);
  topPosts           = signal<Post[]>([]);

  isLoggedIn   = computed(() => this.auth.isAuthorized());
  currentUid   = computed(() => this.auth.userId());
  isOwnProfile = computed(() => !!this.currentUid() && this.currentUid() === (this.author() as any)?._id);

  totalViews = computed(() => this.totalViewsFromApi() || this.posts().reduce((s, p) => s + (p.views ?? 0), 0));
  totalLikes = computed(() => this.totalLikesFromApi() || this.posts().reduce((s, p) => s + (p.likesCount ?? 0), 0));

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
            this.totalViewsFromApi.set((res as any).totalViews ?? 0);
            this.totalLikesFromApi.set((res as any).totalLikes ?? 0);
            this.shortsCountFromApi.set((res as any).shortsCount ?? 0);
            this.topPosts.set((res as any).topPosts ?? []);
            // Show the profile immediately — don't wait for posts/shorts to load
            this.isLoading.set(false);
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
        },
        error: () => {},
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
    const url  = `${environment.siteUrl}/author/${(user as any)._id}`;

    const avatar = (user as any).avatar || environment.ogImage;

    this.titleSvc.setTitle(`${name} — Author | ApnaInsights`);
    this.meta.updateTag({ name: 'description',          content: bio });
    this.meta.updateTag({ name: 'robots',               content: 'index, follow' });
    this.meta.updateTag({ property: 'og:title',         content: `${name} — Author | ApnaInsights` });
    this.meta.updateTag({ property: 'og:description',   content: bio });
    this.meta.updateTag({ property: 'og:url',           content: url });
    this.meta.updateTag({ property: 'og:type',          content: 'profile' });
    this.meta.updateTag({ property: 'og:image',         content: avatar });
    this.meta.updateTag({ property: 'og:image:width',   content: '400' });
    this.meta.updateTag({ property: 'og:image:height',  content: '400' });
    this.meta.updateTag({ name: 'twitter:card',         content: 'summary' });
    this.meta.updateTag({ name: 'twitter:title',        content: `${name} — Author | ApnaInsights` });
    this.meta.updateTag({ name: 'twitter:description',  content: bio });
    this.meta.updateTag({ name: 'twitter:image',        content: avatar });

    // Person structured data
    const schema = {
      '@context': 'https://schema.org',
      '@type': 'Person',
      name,
      url,
      image: avatar,
      description: bio,
      sameAs: [url],
      worksFor: { '@type': 'Organization', name: 'ApnaInsights', url: environment.siteUrl },
    };
    let sd = this.document.getElementById('author-schema') as HTMLScriptElement | null;
    if (!sd) {
      sd = this.document.createElement('script');
      sd.id   = 'author-schema';
      sd.type = 'application/ld+json';
      this.document.head.appendChild(sd);
    }
    sd.textContent = JSON.stringify(schema);

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
