import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

export type VerifiedBadgeSize = 'sm' | 'md' | 'lg';
// 'overlay' = absolutely positioned in the bottom-right corner of a
// position:relative avatar (parent must set position:relative itself).
// 'inline' = sits in normal flow, e.g. next to a name/heading.
export type VerifiedBadgeMode = 'overlay' | 'inline';

@Component({
  selector: 'app-verified-badge',
  standalone: true,
  templateUrl: './verified-badge.html',
  styleUrl: './verified-badge.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.vb-host--overlay]': "mode === 'overlay'",
    '[class.vb-host--inline]': "mode === 'inline'",
    '[class.vb-host--sm]': "size === 'sm'",
    '[class.vb-host--md]': "size === 'md'",
    '[class.vb-host--lg]': "size === 'lg'",
  },
})
export class VerifiedBadge {
  @Input() mode: VerifiedBadgeMode = 'overlay';
  @Input() size: VerifiedBadgeSize = 'md';
  @Input() label = 'Verified';
}
