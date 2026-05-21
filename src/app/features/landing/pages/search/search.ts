import {
  Component, inject, signal, computed, OnInit,
  DestroyRef, PLATFORM_ID, ChangeDetectionStrategy,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CommonModule, isPlatformBrowser, Location } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { debounceTime, distinctUntilChanged, Subject } from 'rxjs';
import { Meta, Title } from '@angular/platform-browser';
import { PostService } from '../../../post/services/post-service';
import { AllPostsCache } from '../../../../core/services/all-posts-cache';
import { Post } from '../../../../core/models/post.model';
import { catchError } from 'rxjs/operators';
import { of } from 'rxjs';
import { TimeAgoPipe } from '../../../../shared/pipes/time-ago-pipe';

@Component({
  selector: 'app-search',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule, TimeAgoPipe],
  templateUrl: './search.html',
  styleUrl: './search.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SearchPage implements OnInit {
  private route       = inject(ActivatedRoute);
  private router      = inject(Router);
  private location    = inject(Location);
  private postService    = inject(PostService);
  private allPostsCache  = inject(AllPostsCache);
  private destroyRef  = inject(DestroyRef);
  private platformId  = inject(PLATFORM_ID);
  private meta        = inject(Meta);
  private titleSvc    = inject(Title);

  query    = signal('');
  allPosts = signal<Post[]>([]);
  isLoading = signal(true);

  private searchInput$ = new Subject<string>();

  results = computed(() => {
    const q     = this.query().trim().toLowerCase();
    const posts = this.allPosts();
    if (!q) return posts.slice(0, 24);
    return posts.filter(p =>
      p.title?.toLowerCase().includes(q) ||
      p.description?.toLowerCase().includes(q) ||
      p.categories?.some(c => c.toLowerCase().includes(q)) ||
      p.tags?.some(t => t.toLowerCase().includes(q))
    );
  });

  hasQuery = computed(() => this.query().trim().length > 0);

  ngOnInit(): void {
    this.titleSvc.setTitle('Search Stories — ApnaInsights');
    this.meta.updateTag({ name: 'description', content: 'Search thousands of articles on ApnaInsights.' });
    this.meta.updateTag({ name: 'robots', content: 'noindex, follow' });

    this.route.queryParamMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(params => this.query.set(params.get('q') ?? ''));

    this.searchInput$
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe(q => {
        this.router.navigate([], {
          queryParams: { q: q || null },
          queryParamsHandling: 'merge',
          replaceUrl: true,
        });
      });

    this.loadPosts();
  }

  onInput(q: string): void {
    this.query.set(q);
    this.searchInput$.next(q);
  }

  clearSearch(): void {
    this.query.set('');
    this.searchInput$.next('');
  }

  goBack(): void {
    const hasPrev = this.router.lastSuccessfulNavigation?.previousNavigation != null;
    hasPrev ? this.location.back() : this.router.navigate(['/']);
  }

  private loadPosts(): void {
    const cached = this.allPostsCache.get();
    if (cached.length) {
      this.allPosts.set(cached.filter(p => p.status === 'published'));
      this.isLoading.set(false);
      return;
    }
    this.postService.getAllPublished()
      .pipe(
        catchError(() => of([] as Post[])),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(posts => {
        const published = posts.filter(p => p.status === 'published');
        this.allPostsCache.set(published);
        this.allPosts.set(published);
        this.isLoading.set(false);
      });
  }

  readingTime(post: Post): number {
    const text = (post.content ?? '').replace(/<[^>]*>/g, '');
    return Math.max(1, Math.ceil(text.trim().split(/\s+/).length / 200));
  }

  trackById(_: number, p: Post): string { return p._id; }
}
