import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-privacy-policy',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './privacy-policy.html',
  styleUrl: './privacy-policy.css'
})
export class PrivacyPolicy implements OnInit, OnDestroy {

  private meta = inject(Meta);
  private title = inject(Title);
  private document = inject(DOCUMENT);

  effectiveDate = 'April 1, 2026';
  currentYear = new Date().getFullYear();

  ngOnInit(): void {
    this.title.setTitle('Privacy Policy | ApnaInsights');
    this.meta.updateTag({ name: 'description', content: 'Read the ApnaInsights Privacy Policy. Learn how we collect, use, and protect your personal information, including our use of Google AdSense advertising cookies.' });
    this.meta.updateTag({ name: 'robots', content: 'index, follow' });

    this.meta.updateTag({ property: 'og:type', content: 'website' });
    this.meta.updateTag({ property: 'og:title', content: 'Privacy Policy | ApnaInsights' });
    this.meta.updateTag({ property: 'og:description', content: 'ApnaInsights Privacy Policy — how we handle your data and use of third-party advertising.' });
    this.meta.updateTag({ property: 'og:url', content: 'https://apnainsights.com/privacy-policy' });

    let canonical = this.document.querySelector('link[rel="canonical"]') as HTMLLinkElement;
    if (!canonical) {
      canonical = this.document.createElement('link');
      canonical.setAttribute('rel', 'canonical');
      this.document.head.appendChild(canonical);
    }
    canonical.setAttribute('href', 'https://apnainsights.com/privacy-policy');
  }

  ngOnDestroy(): void {
    const canonical = this.document.querySelector('link[rel="canonical"]') as HTMLLinkElement;
    if (canonical) canonical.remove();
  }
}
