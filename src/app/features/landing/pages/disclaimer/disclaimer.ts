import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-disclaimer',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './disclaimer.html',
  styleUrl: './disclaimer.css'
})
export class Disclaimer implements OnInit, OnDestroy {

  private meta     = inject(Meta);
  private title    = inject(Title);
  private document = inject(DOCUMENT);

  effectiveDate = 'April 1, 2026';
  currentYear   = new Date().getFullYear();

  ngOnInit(): void {
    this.title.setTitle('Disclaimer | ApnaInsights');
    this.meta.updateTag({ name: 'description', content: 'Read the ApnaInsights Disclaimer. Content on this platform is for informational purposes only and does not constitute professional advice.' });
    this.meta.updateTag({ name: 'robots', content: 'index, follow' });

    this.meta.updateTag({ property: 'og:type',        content: 'website' });
    this.meta.updateTag({ property: 'og:title',       content: 'Disclaimer | ApnaInsights' });
    this.meta.updateTag({ property: 'og:description', content: 'ApnaInsights Disclaimer — content is informational only and does not constitute professional advice.' });
    this.meta.updateTag({ property: 'og:url',         content: 'https://apnainsights.com/disclaimer' });

    let canonical = this.document.querySelector('link[rel="canonical"]') as HTMLLinkElement;
    if (!canonical) {
      canonical = this.document.createElement('link');
      canonical.setAttribute('rel', 'canonical');
      this.document.head.appendChild(canonical);
    }
    canonical.setAttribute('href', 'https://apnainsights.com/disclaimer');
  }

  ngOnDestroy(): void {
    const canonical = this.document.querySelector('link[rel="canonical"]') as HTMLLinkElement;
    if (canonical) canonical.remove();
  }
}
