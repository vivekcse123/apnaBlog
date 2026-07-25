import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

/**
 * Shared numbered-pagination control - previously blog-list had this exact
 * pattern (with ellipsis collapsing) built inline, while category-page and
 * tag-page each used a separate "Load more" button for the same underlying
 * job. Numbered pages are used everywhere now: they're crawlable (each page
 * is a distinct, linkable state) in a way "Load more" isn't.
 */
@Component({
  selector: 'app-pagination',
  standalone: true,
  templateUrl: './pagination.html',
  styleUrl: './pagination.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Pagination {
  currentPage = input.required<number>();
  totalPages  = input.required<number>();

  pageChange = output<number>();

  pageNumbers = computed<(number | '…')[]>(() => {
    const total = this.totalPages();
    const cur   = this.currentPage();
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
    const pages = new Set<number>([1, 2, total - 1, total, cur - 1, cur, cur + 1]);
    const sorted = [...pages].filter(n => n >= 1 && n <= total).sort((a, b) => a - b);
    const out: (number | '…')[] = [];
    let prev = 0;
    for (const n of sorted) {
      if (prev && n - prev > 1) out.push('…');
      out.push(n);
      prev = n;
    }
    return out;
  });

  goTo(n: number): void {
    if (n < 1 || n > this.totalPages() || n === this.currentPage()) return;
    this.pageChange.emit(n);
  }
}
