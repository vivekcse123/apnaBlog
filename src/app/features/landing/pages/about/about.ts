import {
  ChangeDetectionStrategy, Component, OnDestroy, OnInit, PLATFORM_ID, inject, signal
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Meta, Title } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { MobileBottomNav } from '../../../../shared/mobile-bottom-nav/mobile-bottom-nav';
import { PostService } from '../../../post/services/post-service';
import { Auth } from '../../../../core/services/auth';

interface FAQ {
  q: string;
  a: string;
}

@Component({
  selector: 'app-about',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, CommonModule, MobileBottomNav],
  templateUrl: './about.html',
  styleUrl: './about.css'
})
export class About implements OnInit, OnDestroy {

  private meta           = inject(Meta);
  private title          = inject(Title);
  private document       = inject(DOCUMENT);
  private postService    = inject(PostService);
  private platformId     = inject(PLATFORM_ID);
  private auth           = inject(Auth);

  navMenuOpen = false;

  get isLoggedIn(): boolean    { return this.auth.isAuthorized(); }
  get dashboardRoute(): string {
    const role = this.auth.userRole() ?? 'user';
    const id   = this.auth.userId()   ?? '';
    if (role === 'admin')       return `/admin/${id}`;
    if (role === 'super_admin') return `/super-admin/${id}`;
    return `/user/${id}/profile`;
  }
  currentYear = new Date().getFullYear();
  totalStories = signal<number | null>(null);

  faqs: FAQ[] = [
    {
      q: 'What is ApnaInsights?',
      a: 'ApnaInsights is India\'s free knowledge platform where working professionals share practical guides on Technology, Career, Health, Business, Finance, AI, and more. Every article is written by a real person and reviewed before going live. Free to read, free to write, no paywall.'
    },
    {
      q: 'Is ApnaInsights free to use?',
      a: 'Yes, ApnaInsights is completely free. Free to read every article, free to write and publish your own guides. No subscription, no hidden fees, no premium paywall. It will always be free.'
    },
    {
      q: 'How do I start writing on ApnaInsights?',
      a: 'Sign up for a free account and click "Start Writing" to open our article editor. Write, format, and submit your guide across 16+ topics including Technology, Career, Health, Business, Finance, AI, Lifestyle, Education, Sports, Entertainment, Cooking, and more.'
    },
    {
      q: 'Who founded ApnaInsights?',
      a: 'ApnaInsights was founded by Vivek Verma (Founder and Lead Engineer) and Kondra Revathi Satya (CEO). Both are B.Tech graduates who built the platform to give Indian professionals and students a free, trusted place to share what they know.'
    },
    {
      q: 'What topics can I read or write about on ApnaInsights?',
      a: 'ApnaInsights covers 16+ topics: Technology, Career, AI, Finance, Health, Business, Lifestyle, Education, Sports, Entertainment, Cooking, Exercise, Social Issues, Productivity, News, Updates, and more. Each topic has its own feed and trending articles.'
    },
    {
      q: 'Is my content safe and private on ApnaInsights?',
      a: 'Yes. ApnaInsights uses industry-standard encryption to protect your data. We never sell personal data to third parties. Content is moderated to maintain a safe, respectful community. All published content remains the intellectual property of the author.'
    },
    {
      q: 'What technology is ApnaInsights built with?',
      a: 'ApnaInsights is built with Angular 20 (SSR-powered frontend), Node.js (backend), MongoDB (database), TypeScript, Angular Material, and deployed on Vercel for blazing-fast performance.'
    },
    {
      q: 'How can I contact ApnaInsights?',
      a: 'You can reach us at hello@apnainsights.com for general inquiries or supports@apnainsights.com for support. We respond within 24 hours. You can also use the contact form at apnainsights.com/contact.'
    }
  ];

  ngOnInit(): void {
    this.setMetaTags();
    this.injectJsonLd();
    this.fetchStats();
  }

  private fetchStats(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    this.postService.getAllPost(1, 1).subscribe({
      next: res => { if (res.total > 0) this.totalStories.set(res.total); },
      error: () => {},
    });
  }

  ngOnDestroy(): void {
    const scripts = this.document.querySelectorAll('script[data-apna-schema]');
    scripts.forEach(s => s.remove());
  }

  private setMetaTags(): void {

    this.title.setTitle('About ApnaInsights | India\'s Practical Knowledge Platform');

    this.meta.updateTag({ name: 'description', content: 'ApnaInsights is India\'s practical knowledge platform - expert guides across 16+ categories, from technology to career. Free to write, free to read.' });
    this.meta.updateTag({ name: 'keywords', content: 'ApnaInsights, Indian knowledge platform, write guides online India, practical knowledge India, publish articles India, expert guides platform, free writing India, knowledge platform India' });
    this.meta.updateTag({ name: 'robots', content: 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1' });
    this.meta.updateTag({ name: 'author', content: 'Vivek Verma, ApnaInsights' });
    this.meta.updateTag({ name: 'language', content: 'English' });
    this.meta.updateTag({ name: 'geo.region', content: 'IN' });
    this.meta.updateTag({ name: 'geo.country', content: 'India' });

    this.meta.updateTag({ property: 'og:type', content: 'website' });
    this.meta.updateTag({ property: 'og:title', content: 'About ApnaInsights | India\'s Practical Knowledge Platform' });
    this.meta.updateTag({ property: 'og:description', content: 'ApnaInsights is India\'s practical knowledge platform - expert guides across 14 topics. Free to read, free to write.' });
    this.meta.updateTag({ property: 'og:url', content: 'https://apnainsights.com/about' });
    this.meta.updateTag({ property: 'og:site_name', content: 'ApnaInsights' });
    this.meta.updateTag({ property: 'og:image', content: 'https://apnainsights.com/og-image.png' });
    this.meta.updateTag({ property: 'og:image:width', content: '1200' });
    this.meta.updateTag({ property: 'og:image:height', content: '630' });
    this.meta.updateTag({ property: 'og:image:alt', content: 'ApnaInsights - India\'s Practical Knowledge Platform' });
    this.meta.updateTag({ property: 'og:locale', content: 'en_IN' });

    this.meta.updateTag({ name: 'twitter:card', content: 'summary_large_image' });
    this.meta.updateTag({ name: 'twitter:title', content: 'About ApnaInsights | India\'s Practical Knowledge Platform' });
    this.meta.updateTag({ name: 'twitter:description', content: 'India\'s practical knowledge platform. Write expert guides and connect across 14 topics. Free to join.' });
    this.meta.updateTag({ name: 'twitter:image', content: 'https://apnainsights.com/og-image.png' });
    this.meta.updateTag({ name: 'twitter:site', content: '@apnainsights' });
    this.meta.updateTag({ name: 'twitter:creator', content: '@apnainsights' });

    let canonical = this.document.querySelector('link[rel="canonical"]') as HTMLLinkElement;
    if (!canonical) {
      canonical = this.document.createElement('link');
      canonical.setAttribute('rel', 'canonical');
      this.document.head.appendChild(canonical);
    }
    canonical.setAttribute('href', 'https://apnainsights.com/about');
  }

  private injectJsonLd(): void {
    if (this.document.querySelector('script[data-apna-schema]')) return;

    const schemas = [

      {
        '@context': 'https://schema.org',
        '@graph': [
          {
            '@type': 'Organization',
            '@id': 'https://apnainsights.com/#organization',
            name: 'ApnaInsights',
            alternateName: 'Apna Insights',
            url: 'https://apnainsights.com',
            logo: {
              '@type': 'ImageObject',
              url: 'https://apnainsights.com/logo.png',
              width: 1024,
              height: 1024
            },
            description: 'ApnaInsights is India\'s practical knowledge platform where contributors share expert guides across 14 topics including technology, lifestyle, health, career, business and more.',
            foundingDate: '2024',
            foundingLocation: { '@type': 'Place', addressCountry: 'IN' },
            founders: [
              { '@type': 'Person', name: 'Vivek Verma', jobTitle: 'Founder & Lead Engineer' },
              { '@type': 'Person', name: 'Kondra Revathi Satya', jobTitle: 'Chief Executive Officer' }
            ],
            contactPoint: [
              { '@type': 'ContactPoint', contactType: 'customer support', email: 'supports@apnainsights.com', availableLanguage: ['English', 'Hindi'] },
              { '@type': 'ContactPoint', contactType: 'general inquiry', email: 'hello@apnainsights.com' }
            ],
            address: { '@type': 'PostalAddress', addressCountry: 'IN' },
            sameAs: [
              'https://twitter.com/apnainsights',
              'https://linkedin.com/company/apnainsights',
              'https://instagram.com/apnainsights',
              'https://github.com/apnainsights'
            ]
          },
          {
            '@type': 'WebSite',
            '@id': 'https://apnainsights.com/#website',
            url: 'https://apnainsights.com',
            name: 'ApnaInsights',
            publisher: { '@id': 'https://apnainsights.com/#organization' }
          },
          {
            '@type': 'WebPage',
            '@id': 'https://apnainsights.com/about#webpage',
            url: 'https://apnainsights.com/about',
            name: 'About ApnaInsights | India\'s Practical Knowledge Platform',
            description: 'Learn about ApnaInsights, India\'s practical knowledge platform. Meet the team, discover our mission, and find out how we empower contributors across India.',
            inLanguage: 'en-IN',
            isPartOf: { '@id': 'https://apnainsights.com/#website' },
            about: { '@id': 'https://apnainsights.com/#organization' },
            datePublished: '2024-01-01',
            dateModified: '2026-01-01'
          },
          {
            '@type': 'BreadcrumbList',
            '@id': 'https://apnainsights.com/about#breadcrumb',
            itemListElement: [
              { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://apnainsights.com' },
              { '@type': 'ListItem', position: 2, name: 'About', item: 'https://apnainsights.com/about' }
            ]
          }
        ]
      },

      {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: this.faqs.map(f => ({
          '@type': 'Question',
          name: f.q,
          acceptedAnswer: { '@type': 'Answer', text: f.a }
        }))
      },

    ];

    schemas.forEach((schema, i) => {
      const script = this.document.createElement('script');
      script.type = 'application/ld+json';
      script.setAttribute('data-apna-schema', String(i));
      script.textContent = JSON.stringify(schema);
      this.document.head.appendChild(script);
    });
  }

}