import { Pipe, PipeTransform } from '@angular/core';

@Pipe({ name: 'timeAgo', standalone: true, pure: true })
export class TimeAgoPipe implements PipeTransform {
  transform(value: Date | string | null | undefined): string {
    if (!value) return '';

    const date  = value instanceof Date ? value : new Date(value);
    if (isNaN(date.getTime())) return '';

    const seconds = Math.floor((Date.now() - date.getTime()) / 1000);

    if (seconds < 60)               return 'just now';
    if (seconds < 3600)             return `${Math.floor(seconds / 60)} min ago`;
    if (seconds < 86400)            return `${Math.floor(seconds / 3600)} hr ago`;
    if (seconds < 7 * 86400)        return `${Math.floor(seconds / 86400)} days ago`;

    // Older than 7 days - show absolute date (better for credibility)
    return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  }
}
