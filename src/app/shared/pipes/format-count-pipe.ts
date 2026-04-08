import { Pipe, PipeTransform } from '@angular/core';

/**
 * FormatCountPipe
 *
 * Replaces the `formatCount()` method that was called directly in templates.
 *
 * WHY A PIPE?
 * Angular pipes with `pure: true` (the default) are memoised by the framework:
 * the transform is only re-executed when the input value reference changes.
 * Calling a component method in a template has no such guarantee — it runs on
 * every change-detection cycle, even when the value hasn't changed.
 *
 * USAGE IN TEMPLATE:
 *   {{ post.views | formatCount }}
 *   {{ totalViews() | formatCount }}
 */
@Pipe({
  name: 'formatCount',
  standalone: true,
  pure: true,   // default — memoised per input value
})
export class FormatCountPipe implements PipeTransform {
  transform(n: number): string {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
    if (n >= 1_000)     return (n / 1_000).toFixed(1) + 'K';
    return n.toString();
  }
}