import {
  Component,
  inject,
  input,
  signal,
  computed,
  output,
  HostListener,
  OnInit,
  OnDestroy,
  DestroyRef,
} from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { PostService } from '../../../post/services/post-service';
import { Post } from '../../../../core/models/post.model';

@Component({
  selector: 'app-read-blog',
  imports: [DatePipe, CommonModule],
  templateUrl: './read-blog.html',
  styleUrl: './read-blog.css',
})
export class ReadBlog implements OnInit, OnDestroy {
  private postService = inject(PostService);
  private destroyRef  = inject(DestroyRef);

  postId    = input('');
  post      = signal<Post | null>(null);
  isLoading = signal(true);
  isVisible = signal(false);

  close = output<void>();

  // ── Carousel ────────────────────────────────────────────────────────────────
  currentSlide = signal(0);
  private carouselTimer: ReturnType<typeof setInterval> | null = null;

  carouselImages = computed(() => {
    const p = this.post();
    if (!p) return [];
    const imgs: string[] = [];
    if (p.featuredImage) imgs.push(p.featuredImage);
    if (p.images?.length) imgs.push(...p.images);
    return imgs;
  });

  // ── Lifecycle ────────────────────────────────────────────────────────────────
  ngOnInit(): void {
    setTimeout(() => this.isVisible.set(true), 10);

    this.postService.getPostById(this.postId())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.post.set(res.data);
          this.isLoading.set(false);
          if (this.carouselImages().length > 1) {
            this.startCarousel();
          }
        },
        error: (err) => {
          console.error(err);
          this.isLoading.set(false);
        },
      });
  }

  ngOnDestroy(): void {
    this.stopCarousel();
  }

  // ── Carousel controls ─────────────────────────────────────────────────────
  private startCarousel(): void {
    this.carouselTimer = setInterval(() => {
      const total = this.carouselImages().length;
      this.currentSlide.update(i => (i + 1) % total);
    }, 3500);
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

  // ── Modal controls ────────────────────────────────────────────────────────
  closeModal(): void {
    this.isVisible.set(false);
    setTimeout(() => this.close.emit(), 300);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.closeModal();
  }

  onBackdropClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('modal-backdrop')) {
      this.closeModal();
    }
  }

  readingTime(): number {
    const content = this.post()?.content ?? '';
    const words = content.trim().split(/\s+/).length;
    return Math.max(1, Math.ceil(words / 200));
  }
}
