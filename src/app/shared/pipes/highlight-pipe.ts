import { Pipe, PipeTransform, inject } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

@Pipe({ name: 'highlight', standalone: true, pure: true })
export class HighlightPipe implements PipeTransform {
  private sanitizer = inject(DomSanitizer);

  transform(text: string | null | undefined, query: string | null | undefined): SafeHtml {
    const safeText = this.escapeHtml(text ?? '');
    const q = (query ?? '').trim();
    if (!q) return this.sanitizer.bypassSecurityTrustHtml(safeText);

    const escapedQuery = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const highlighted = safeText.replace(
      new RegExp(`(${escapedQuery})`, 'ig'),
      '<mark class="sp-hl">$1</mark>',
    );
    return this.sanitizer.bypassSecurityTrustHtml(highlighted);
  }

  private escapeHtml(s: string): string {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}
