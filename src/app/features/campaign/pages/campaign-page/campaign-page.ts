import {
  ChangeDetectionStrategy, Component, DestroyRef, OnInit,
  PLATFORM_ID, computed, inject, signal,
} from '@angular/core';
import { CommonModule, DOCUMENT, isPlatformBrowser } from '@angular/common';
import { RouterLink, ActivatedRoute, Router } from '@angular/router';
import { Meta, Title, DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { PostService } from '../../../post/services/post-service';
import { Post } from '../../../../core/models/post.model';
import { environment } from '../../../../../environments/environment';
import { sanitizeHtml } from '../../../../shared/utils/sanitize-html';

@Component({
  selector: 'app-campaign-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterLink],
  templateUrl: './campaign-page.html',
  styleUrl:    './campaign-page.css',
})
export class CampaignPage implements OnInit {
  private postService = inject(PostService);
  private route       = inject(ActivatedRoute);
  private router      = inject(Router);
  private destroyRef  = inject(DestroyRef);
  private platformId  = inject(PLATFORM_ID);
  private document    = inject(DOCUMENT);
  private meta        = inject(Meta);
  private titleSvc    = inject(Title);
  private sanitizer   = inject(DomSanitizer);
  private readonly apiBase = environment.apiUrl;

  post      = signal<Post | null>(null);
  isLoading = signal(true);
  loadError = signal(false);

  safeContent = computed<SafeHtml>(() => {
    const p = this.post();
    if (!p?.content) return this.sanitizer.bypassSecurityTrustHtml('');
    return this.sanitizer.bypassSecurityTrustHtml(sanitizeHtml(p.content));
  });

  ngOnInit(): void {
    this.route.paramMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(params => {
        const id = params.get('id');
        if (!id) { this.router.navigate(['/']); return; }
        this.load(id);
      });
  }

  private load(id: string): void {
    this.isLoading.set(true);
    this.loadError.set(false);
    this.post.set(null);

    this.postService.getPostById(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: res => {
          const p = res.data;
          if (!p) { this.loadError.set(true); this.isLoading.set(false); return; }

          // Non-sponsored posts don't have a campaign page - send to blog
          if (!p.isSponsored) {
            this.router.navigate(['/blog', id], { replaceUrl: true });
            return;
          }

          this.post.set(p);
          this.isLoading.set(false);
          this.titleSvc.setTitle(`${p.title} | Sponsored | ApnaInsights`);
          // Sponsored pages must not be indexed - they are ads, not editorial content
          this.meta.updateTag({ name: 'robots', content: 'noindex,nofollow' });
        },
        error: () => { this.isLoading.set(false); this.loadError.set(true); },
      });
  }

  trackAndVisit(postId: string, url: string): void {
    if (!isPlatformBrowser(this.platformId) || !url) return;
    const payload = JSON.stringify({
      postId,
      url,
      referrer:   this.document.referrer || '',
      deviceType: /Mobi|Android/i.test(navigator.userAgent) ? 'mobile' : 'desktop',
      visitorId:  this._visitorId(),
    });
    const endpoint = `${this.apiBase}/sponsorship/track-click`;
    if (navigator.sendBeacon) {
      navigator.sendBeacon(endpoint, new Blob([payload], { type: 'application/json' }));
    } else {
      fetch(endpoint, { method: 'POST', body: payload, headers: { 'Content-Type': 'application/json' }, keepalive: true }).catch(() => {});
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  private _visitorId(): string {
    try {
      let vid = localStorage.getItem('_apna_vid');
      if (!vid) { vid = Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem('_apna_vid', vid); }
      return vid;
    } catch { return 'anon'; }
  }

  brandInitial(brand: string | null | undefined): string {
    return brand?.charAt(0)?.toUpperCase() || 'A';
  }

  formatDate(d: string | Date | null | undefined): string {
    if (!d) return '';
    return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  formatViews(n: number): string {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
    if (n >= 1_000) return (n / 1_000).toFixed(1) + 'k';
    return String(n);
  }
}
