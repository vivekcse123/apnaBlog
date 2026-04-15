import {
  Component, Input, Output, EventEmitter,
  ChangeDetectionStrategy, inject, signal, PLATFORM_ID,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Post } from '../../../core/models/post.model';
import { FormatCountPipe } from '../../pipes/format-count-pipe';

@Component({
  selector: 'app-post-card',
  standalone: true,
  imports: [CommonModule, RouterLink, FormatCountPipe],
  templateUrl: './post-card.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PostCard {
  @Input({ required: true }) post!: Post;
  @Input() isLiked   = false;
  @Input() showBadge = true;
  @Input() variant: 'default' | 'compact' | 'featured' = 'default';

  readonly categoryEmojis: Record<string, string> = {
    Sports: '🏏', Entertainment: '🎬', Health: '🏥', Technology: '💻', Business: '💼',
    Lifestyle: '🌿', Education: '🎓', Exercise: '🏋️', Cooking: '🍳',
    Social: '🤝', Quotes: '💬', Village: '🌾',
  };

  @Output() readPost    = new EventEmitter<Post>();
  @Output() toggleLike  = new EventEmitter<Post>();

  private platformId = inject(PLATFORM_ID);
  isHovered = signal(false);
  imgError  = signal(false);

  get authorInitials(): string {
    if (!this.post?.user) return '?';
    const u = this.post.user;
    const name = (u as any).name ?? (u as any).username ?? '';
    return name
      .split(' ')
      .slice(0, 2)
      .map((w: string) => w[0]?.toUpperCase() ?? '')
      .join('');
  }

  get authorName(): string {
    if (!this.post?.user) return 'Anonymous';
    const u = this.post.user as any;
    return u.name ?? u.username ?? 'Anonymous';
  }

  get authorAvatar(): string | null {
    const u = this.post?.user as any;
    return u?.profilePic ?? u?.avatar ?? null;
  }

  get formattedDate(): string {
    const d = new Date(this.post.createdAt);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffDays = Math.floor(diffMs / 86_400_000);
    if (diffDays === 0) {
      const diffH = Math.floor(diffMs / 3_600_000);
      if (diffH === 0) return 'just now';
      return `${diffH}h ago`;
    }
    if (diffDays < 7) return `${diffDays}d ago`;
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  get readingTime(): number {
    const words = ((this.post.content ?? '') + ' ' + (this.post.description ?? ''))
      .replace(/<[^>]+>/g, '')
      .split(/\s+/)
      .filter(Boolean).length;
    return Math.max(1, Math.ceil(words / 200));
  }

  get primaryCategory(): string {
    return this.post.categories?.[0] ?? '';
  }

  onImageError(): void {
    this.imgError.set(true);
  }

  onRead(e: Event): void {
    e.preventDefault();
    this.readPost.emit(this.post);
  }

  onLike(e: Event): void {
    e.stopPropagation();
    this.toggleLike.emit(this.post);
  }

  trackByCat(_: number, c: string) { return c; }
}
