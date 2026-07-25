import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Post } from '../../../core/models/post.model';
import { BookmarkService } from '../../../core/services/bookmark.service';
import { CloudinaryResizePipe } from '../../pipes/cloudinary-resize-pipe';
import { TimeAgoPipe } from '../../pipes/time-ago-pipe';
import { categoryColorFor } from '../../utils/category-color';
import { estimateReadingTimeMinutes } from '../../utils/reading-time';

/**
 * Single shared blog-post card, used by blog-list, category-page and
 * tag-page - previously three independent implementations (.bl-post-card,
 * .cgp-card in two places) that had quietly drifted: only blog-list showed
 * a views/likes stat row, and bookmark/reading-time/author logic was
 * duplicated verbatim in all three page components.
 */
@Component({
  selector: 'app-post-card',
  standalone: true,
  imports: [CommonModule, RouterLink, CloudinaryResizePipe, TimeAgoPipe],
  templateUrl: './post-card.html',
  styleUrl: './post-card.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PostCard {
  private bookmarkService = inject(BookmarkService);

  post = input.required<Post>();
  imageWidth  = input(380);
  imageHeight = input(220);

  /** Views/likes stat row - on by default (blog-list's richer treatment,
   * now applied everywhere instead of only on one of the three pages). */
  showStats = input(true);

  /** Category badge overlaid on the image. Category pages hide it since
   * every card on that page is already the same category. */
  showCategoryBadge = input(true);

  postUrl = computed<any[]>(() => ['/blog', this.post().slug || this.post()._id]);
  authorName = computed(() => (this.post().user as any)?.name ?? 'Anonymous');
  authorId = computed<string | null>(() => (this.post().user as any)?._id ?? null);
  authorInitial = computed(() => this.authorName().charAt(0).toUpperCase());
  category = computed(() => this.post().categories?.[0] ?? null);
  categoryColor = computed(() => this.category() ? categoryColorFor(this.category()!) : '');
  readingTime = computed(() => estimateReadingTimeMinutes(this.post()));

  isBookmarked = computed(() => this.bookmarkService.isBookmarked(this.post()._id));

  toggleBookmark(event: Event): void {
    event.stopPropagation();
    event.preventDefault();
    this.bookmarkService.toggle(this.post()._id);
  }

  fmtCount(n: number): string {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
    if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
    return String(n);
  }
}
