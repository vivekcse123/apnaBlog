import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { readCachedSiteStats, formatStatCount, CachedSiteStats } from '../../core/utils/site-stats.util';

/**
 * Real-stats footer strip shown at the bottom of every auth page card
 * (Articles / Topics / Reads, each with an icon). Reads straight from the
 * same cache home.ts populates - see site-stats.util.ts for why this never
 * falls back to a fabricated placeholder number.
 */
@Component({
  selector: 'app-auth-trust-bar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './auth-trust-bar.html',
  styleUrl: './auth-trust-bar.css',
})
export class AuthTrustBar {
  siteStats = signal<CachedSiteStats | null>(null);
  formatStatCount = formatStatCount;

  constructor() {
    this.siteStats.set(readCachedSiteStats());
  }
}
