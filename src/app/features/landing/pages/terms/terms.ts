import {
  ChangeDetectionStrategy, Component, OnDestroy, OnInit, inject
} from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { RouterLink } from '@angular/router';
import { environment } from '../../../../../environments/environment';
import { MobileBottomNav } from '../../../../shared/mobile-bottom-nav/mobile-bottom-nav';

@Component({
  selector: 'app-terms',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, MobileBottomNav],
  templateUrl: './terms.html',
  styleUrl: './terms.css'
})
export class Terms implements OnInit, OnDestroy {

  private meta = inject(Meta);
  private title = inject(Title);
  private document = inject(DOCUMENT);

  effectiveDate = 'April 1, 2026';
  currentYear = new Date().getFullYear();

  ngOnInit(): void {
    this.title.setTitle('Terms of Service | ApnaInsights');
    this.meta.updateTag({ name: 'description', content: 'Read the ApnaInsights Terms of Service. By using apnainsights.com you agree to these terms governing your use of our community blogging platform.' });
    this.meta.updateTag({ name: 'robots', content: 'index, follow' });

    this.meta.updateTag({ property: 'og:type', content: 'website' });
    this.meta.updateTag({ property: 'og:title', content: 'Terms of Service | ApnaInsights' });
    this.meta.updateTag({ property: 'og:description', content: 'ApnaInsights Terms of Service — rules and guidelines for using our community blogging platform.' });
    this.meta.updateTag({ property: 'og:url', content: environment.siteUrl + '/terms' });

    let canonical = this.document.querySelector('link[rel="canonical"]') as HTMLLinkElement;
    if (!canonical) {
      canonical = this.document.createElement('link');
      canonical.setAttribute('rel', 'canonical');
      this.document.head.appendChild(canonical);
    }
    canonical.setAttribute('href', environment.siteUrl + '/terms');
  }

  ngOnDestroy(): void {
    const canonical = this.document.querySelector('link[rel="canonical"]') as HTMLLinkElement;
    if (canonical) canonical.remove();
  }
}
