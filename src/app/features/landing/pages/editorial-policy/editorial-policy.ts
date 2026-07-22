import {
  ChangeDetectionStrategy, Component, OnDestroy, OnInit, inject
} from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { RouterLink } from '@angular/router';
import { environment } from '../../../../../environments/environment';
import { MobileBottomNav } from '../../../../shared/mobile-bottom-nav/mobile-bottom-nav';

@Component({
  selector: 'app-editorial-policy',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, MobileBottomNav],
  templateUrl: './editorial-policy.html',
  styleUrl: './editorial-policy.css'
})
export class EditorialPolicy implements OnInit, OnDestroy {

  private meta     = inject(Meta);
  private title    = inject(Title);
  private document = inject(DOCUMENT);

  effectiveDate = 'June 1, 2026';
  currentYear   = new Date().getFullYear();

  ngOnInit(): void {
    this.title.setTitle('Editorial Policy | ApnaInsights');
    this.meta.updateTag({ name: 'description', content: 'ApnaInsights Editorial Policy - learn how we review, moderate, and maintain quality standards for all content published on our knowledge platform.' });
    this.meta.updateTag({ name: 'robots', content: 'index, follow' });

    this.meta.updateTag({ property: 'og:type',        content: 'website' });
    this.meta.updateTag({ property: 'og:title',       content: 'Editorial Policy | ApnaInsights' });
    this.meta.updateTag({ property: 'og:description', content: 'How ApnaInsights reviews, moderates, and ensures quality across all user-generated content.' });
    this.meta.updateTag({ property: 'og:url',         content: environment.siteUrl + '/editorial-policy' });
    this.meta.updateTag({ property: 'og:image',        content: environment.ogImage });
    this.meta.updateTag({ property: 'og:image:width',  content: '1200' });
    this.meta.updateTag({ property: 'og:image:height', content: '630' });
    this.meta.updateTag({ property: 'og:image:alt',    content: 'Editorial Policy | ApnaInsights' });
    this.meta.updateTag({ name: 'twitter:card',        content: 'summary_large_image' });
    this.meta.updateTag({ name: 'twitter:title',       content: 'Editorial Policy | ApnaInsights' });
    this.meta.updateTag({ name: 'twitter:image',       content: environment.ogImage });

    let canonical = this.document.querySelector('link[rel="canonical"]') as HTMLLinkElement;
    if (!canonical) {
      canonical = this.document.createElement('link');
      canonical.setAttribute('rel', 'canonical');
      this.document.head.appendChild(canonical);
    }
    canonical.setAttribute('href', environment.siteUrl + '/editorial-policy');
  }

  ngOnDestroy(): void {
    const canonical = this.document.querySelector('link[rel="canonical"]') as HTMLLinkElement;
    if (canonical) canonical.remove();
  }
}
