import {
  Component,
  inject,
  input,
  signal,
  output,
  HostListener,
  OnInit,
  DestroyRef,
  ChangeDetectionStrategy,
  computed,
} from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { PostService } from '../../../post/services/post-service';
import { Post } from '../../../../core/models/post.model';

@Component({
  selector: 'app-read-blog',
  imports: [DatePipe, CommonModule],
  templateUrl: './read-blog.html',
  styleUrl: './read-blog.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})

export class ReadBlog implements OnInit {
  private postService = inject(PostService);
  private destroyRef  = inject(DestroyRef);
  private sanitizer   = inject(DomSanitizer);

  postId    = input('');
  post      = signal<Post | null>(null);
  isLoading = signal(true);
  isVisible = signal(false);

  close = output<void>();

  safeContent = computed<SafeHtml>(() =>
    this.sanitizer.bypassSecurityTrustHtml(this.post()?.content ?? '')
  );

  ngOnInit(): void {
    setTimeout(() => this.isVisible.set(true), 10);

    this.postService.getPostById(this.postId())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.post.set(res.data);
          this.isLoading.set(false);
        },
        error: (err) => {
          console.error(err);
          this.isLoading.set(false);
        },
      });
  }

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