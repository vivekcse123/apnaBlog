import { Pipe, PipeTransform } from '@angular/core';

/**
 * Shared K/M abbreviation core - the single source of truth for turning a
 * raw count into a compact "1.2K" / "3.4M" string. FormatCountPipe below and
 * site-stats.util.ts's formatStatCount both build on this rather than each
 * re-implementing the rounding/threshold logic, so a future change to it
 * (e.g. the K/M cutoffs) only needs to happen in one place.
 */
export function formatCompactCount(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000)     return (n / 1_000).toFixed(1) + 'K';
  return n.toString();
}

/**
 * FormatCountPipe
 *
 * Replaces the `formatCount()` method that was called directly in templates.
 *
 * WHY A PIPE?
 * Angular pipes with `pure: true` (the default) are memoised by the framework:
 * the transform is only re-executed when the input value reference changes.
 * Calling a component method in a template has no such guarantee - it runs on
 * every change-detection cycle, even when the value hasn't changed.
 *
 * USAGE IN TEMPLATE:
 *   {{ post.views | formatCount }}
 *   {{ totalViews() | formatCount }}
 */
@Pipe({
  name: 'formatCount',
  standalone: true,
  pure: true,   // default - memoised per input value
})
export class FormatCountPipe implements PipeTransform {
  transform(n: number): string {
    return formatCompactCount(n);
  }
}