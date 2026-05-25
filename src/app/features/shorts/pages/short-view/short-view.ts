import {
  AfterViewInit, ChangeDetectionStrategy, Component, OnInit, PLATFORM_ID, inject, signal
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { DomSanitizer, Meta, Title, SafeResourceUrl } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { ShortsService } from '../../services/shorts.service';
import { VideoShort } from '../../models/video-short.model';
import { MobileBottomNav } from '../../../../shared/mobile-bottom-nav/mobile-bottom-nav';

@Component({
  selector: 'app-short-view',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterLink, MobileBottomNav],
  templateUrl: './short-view.html',
  styleUrl: './short-view.css',
})
export class ShortView implements OnInit, AfterViewInit {
  private route      = inject(ActivatedRoute);
  private router     = inject(Router);
  private service    = inject(ShortsService);
  private sanitizer  = inject(DomSanitizer);
  private titleSvc   = inject(Title);
  private meta       = inject(Meta);
  private doc        = inject(DOCUMENT);
  private platformId = inject(PLATFORM_ID);

  short     = signal<VideoShort | null>(null);
  isLoading = signal(true);
  notFound  = signal(false);
  ytPlaying = signal(false);

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) { this.router.navigate(['/shorts']); return; }

    this.service.getShortById(id).subscribe({
      next: res => {
        const s = res.data;
        if (!s) { this.notFound.set(true); this.isLoading.set(false); return; }
        this.short.set(s);
        this.isLoading.set(false);
        this.applyMeta(s);
      },
      error: () => { this.notFound.set(true); this.isLoading.set(false); },
    });
  }

  ngAfterViewInit(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    try {
      ((window as any).adsbygoogle = (window as any).adsbygoogle || []).push({});
    } catch { /* already initialised */ }
  }

  safeEmbedUrl(youtubeId: string): SafeResourceUrl {
    const origin = encodeURIComponent(this.doc.location?.origin ?? 'https://apnainsights.com');
    return this.sanitizer.bypassSecurityTrustResourceUrl(
      `https://www.youtube.com/embed/${youtubeId}?autoplay=1&playsinline=1&rel=0&modestbranding=1&controls=1&iv_load_policy=3&enablejsapi=1&origin=${origin}`
    );
  }

  // mqdefault — raw video frame, no YouTube Shorts red-icon overlay
  cleanThumbnail(youtubeId: string): string {
    return `https://img.youtube.com/vi/${youtubeId}/mqdefault.jpg`;
  }

  playYt(): void { this.ytPlaying.set(true); }

  userInitial(user: VideoShort['user']): string {
    return (user?.name ?? '?').charAt(0).toUpperCase();
  }

  formatCount(n: number): string {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
    if (n >= 1_000)     return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'k';
    return String(n);
  }

  private applyMeta(s: VideoShort): void {
    const title       = `${s.title} — ${s.category} Short | ApnaInsights`;
    const description = s.caption
      ? s.caption.slice(0, 155)
      : `Watch "${s.title}" on ApnaInsights Shorts — ${s.category} videos.`;
    const thumb = s.thumbnailUrl
      ?? (s.youtubeId ? `https://img.youtube.com/vi/${s.youtubeId}/mqdefault.jpg` : '');
    const url = `https://apnainsights.com/shorts/${s._id}`;

    this.titleSvc.setTitle(title);
    this.meta.updateTag({ name: 'description',         content: description });
    this.meta.updateTag({ name: 'robots',              content: 'index, follow' });
    this.meta.updateTag({ property: 'og:title',        content: title });
    this.meta.updateTag({ property: 'og:description',  content: description });
    this.meta.updateTag({ property: 'og:url',          content: url });
    this.meta.updateTag({ property: 'og:type',         content: 'video.other' });
    if (thumb) this.meta.updateTag({ property: 'og:image', content: thumb });

    const schema = {
      '@context':    'https://schema.org',
      '@type':       'VideoObject',
      name:          s.title,
      description,
      thumbnailUrl:  thumb || undefined,
      uploadDate:    s.createdAt,
      author: { '@type': 'Person', name: s.user?.name },
      publisher: { '@type': 'Organization', name: 'ApnaInsights', url: 'https://apnainsights.com' },
      ...(s.videoType === 'youtube' && s.youtubeId
        ? { embedUrl: `https://www.youtube.com/embed/${s.youtubeId}` }
        : s.videoUrl ? { contentUrl: s.videoUrl } : {}),
    };
    let sd = this.doc.getElementById('sv-schema') as HTMLScriptElement | null;
    if (!sd) {
      sd = this.doc.createElement('script');
      sd.id   = 'sv-schema';
      sd.type = 'application/ld+json';
      this.doc.head.appendChild(sd);
    }
    sd.textContent = JSON.stringify(schema);

    let canonical = this.doc.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!canonical) {
      canonical = this.doc.createElement('link');
      canonical.setAttribute('rel', 'canonical');
      this.doc.head.appendChild(canonical);
    }
    canonical.setAttribute('href', url);
  }
}
