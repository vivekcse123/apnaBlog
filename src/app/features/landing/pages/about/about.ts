import { Component, OnInit, OnDestroy, inject, signal } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule, NgForm } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';

interface ContactData {
  name: string;
  email: string;
  subject: string;
  message: string;
}

interface FAQ {
  q: string;
  a: string;
}

@Component({
  selector: 'app-about',
  standalone: true,
  imports: [RouterLink, FormsModule, CommonModule],
  templateUrl: './about.html',
  styleUrl: './about.css'
})
export class About implements OnInit, OnDestroy {

  private meta = inject(Meta);
  private title = inject(Title);
  private document = inject(DOCUMENT);
  private http = inject(HttpClient);

  navMenuOpen = false;
  formSubmitted = false;
  currentYear = new Date().getFullYear();

  isSubmitting = signal(false);
  successMessage = signal('');
  errorMessage = signal('');

  contactData: ContactData = {
    name: '',
    email: '',
    subject: '',
    message: ''
  };

  faqs: FAQ[] = [
    {
      q: 'What is ApnaInsights?',
      a: 'ApnaInsights is India\'s community-first blogging platform where real people share real experiences. Writers publish stories on technology, lifestyle, health, business, education, entertainment, social issues, and village life. The platform has 1000+ stories, 100+ active writers, and 10,000+ monthly readers.'
    },
    {
      q: 'Is ApnaInsights free to use?',
      a: 'Yes, ApnaInsights is completely free to read and write. Any registered user can publish stories, engage with the community, and access all platform features at no cost — no hidden fees, no premium paywalls.'
    },
    {
      q: 'How do I start writing on ApnaInsights?',
      a: 'Simply sign up for a free account, then click "Write a Story" to access our rich blog editor. You can publish in 8 categories: Technology, Lifestyle, Education, Health, Business, Entertainment, Social, and Village.'
    },
    {
      q: 'Who founded ApnaInsights?',
      a: 'ApnaInsights was founded by Vivek Verma (Founder & Lead Engineer) and Kondra Revathi Satya (CEO). Both are B.Tech graduates with a passion for building technology that empowers Indian communities.'
    },
    {
      q: 'What categories can I write about on ApnaInsights?',
      a: 'ApnaInsights supports 8 content categories: Technology, Lifestyle, Education, Health, Business, Entertainment, Social Issues, and Village Life. Each category has a dedicated feed and trending algorithm.'
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
      a: 'You can reach us at hello@apnainsights.com for general inquiries or supports@apnainsights.com for support. We respond within 24 hours. You can also use the contact form on this page.'
    }
  ];

  ngOnInit(): void {
    this.setMetaTags();
    this.injectJsonLd();
  }

  ngOnDestroy(): void {

    const scripts = this.document.querySelectorAll('script[data-apna-schema]');
    scripts.forEach(s => s.remove());
  }

  private setMetaTags(): void {

    this.title.setTitle('About ApnaInsights | Community Blogging Platform Built for India');

    this.meta.updateTag({ name: 'description', content: 'ApnaInsights is India\'s community-first blogging platform. Publish stories on technology, lifestyle, health, business, village life and more. 10K+ stories, 5K+ writers, 50K+ readers. Free to write, free to read.' });
    this.meta.updateTag({ name: 'keywords', content: 'ApnaInsights, Indian blogging platform, write blogs online India, community blogging, publish stories India, blog writing platform, free blogging India, blog platform Telugu, Hindi blog platform' });
    this.meta.updateTag({ name: 'robots', content: 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1' });
    this.meta.updateTag({ name: 'author', content: 'Vivek Verma, ApnaInsights' });
    this.meta.updateTag({ name: 'language', content: 'English' });
    this.meta.updateTag({ name: 'geo.region', content: 'IN' });
    this.meta.updateTag({ name: 'geo.country', content: 'India' });

    this.meta.updateTag({ property: 'og:type', content: 'website' });
    this.meta.updateTag({ property: 'og:title', content: 'About ApnaInsights | Community Blogging Platform Built for India' });
    this.meta.updateTag({ property: 'og:description', content: 'ApnaInsights is India\'s community-first blogging platform where real people share real experiences. 10K+ stories, 5K+ active writers, 50K+ monthly readers.' });
    this.meta.updateTag({ property: 'og:url', content: 'https://www.apnainsights.com/about' });
    this.meta.updateTag({ property: 'og:site_name', content: 'ApnaInsights' });
    this.meta.updateTag({ property: 'og:image', content: 'https://www.apnainsights.com/images/og-about.jpg' });
    this.meta.updateTag({ property: 'og:image:width', content: '1200' });
    this.meta.updateTag({ property: 'og:image:height', content: '630' });
    this.meta.updateTag({ property: 'og:image:alt', content: 'ApnaInsights - Community Blogging Platform for India' });
    this.meta.updateTag({ property: 'og:locale', content: 'en_IN' });

    this.meta.updateTag({ name: 'twitter:card', content: 'summary_large_image' });
    this.meta.updateTag({ name: 'twitter:title', content: 'About ApnaInsights | Community Blogging Platform' });
    this.meta.updateTag({ name: 'twitter:description', content: 'India\'s community-first blogging platform. Write, share, and connect. 10K+ stories published. Free to join.' });
    this.meta.updateTag({ name: 'twitter:image', content: 'https://www.apnainsights.com/images/og-about.jpg' });
    this.meta.updateTag({ name: 'twitter:site', content: '@apnainsights' });
    this.meta.updateTag({ name: 'twitter:creator', content: '@apnainsights' });

    let canonical = this.document.querySelector('link[rel="canonical"]') as HTMLLinkElement;
    if (!canonical) {
      canonical = this.document.createElement('link');
      canonical.setAttribute('rel', 'canonical');
      this.document.head.appendChild(canonical);
    }
    canonical.setAttribute('href', 'https://www.apnainsights.com/about');
  }

  private injectJsonLd(): void {
    const schemas = [

      {
        '@context': 'https://schema.org',
        '@type': 'Organization',
        name: 'ApnaInsights',
        alternateName: 'Apna Insights',
        url: 'https://www.apnainsights.com',
        logo: 'https://www.apnainsights.com/images/logo.png',
        description: 'ApnaInsights is India\'s community-first blogging platform where real people share real experiences — from village life to tech innovations, from health journeys to business breakthroughs.',
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
        '@context': 'https://schema.org',
        '@graph': [
          {
            '@type': 'WebPage',
            '@id': 'https://www.apnainsights.com/about',
            url: 'https://www.apnainsights.com/about',
            name: 'About ApnaInsights | Community Blogging Platform Built for India',
            description: 'Learn about ApnaInsights, India\'s community-first blogging platform. Meet the team, discover our mission, and find out how we empower writers across India.',
            inLanguage: 'en-IN',
            isPartOf: { '@id': 'https://www.apnainsights.com' },
            about: { '@type': 'Organization', name: 'ApnaInsights' },
            datePublished: '2024-01-01',
            dateModified: '2025-01-01',
            breadcrumb: {
              '@type': 'BreadcrumbList',
              itemListElement: [
                { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://www.apnainsights.com' },
                { '@type': 'ListItem', position: 2, name: 'About', item: 'https://www.apnainsights.com/about' }
              ]
            }
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
      }
    ];

    schemas.forEach((schema, i) => {
      const script = this.document.createElement('script');
      script.type = 'application/ld+json';
      script.setAttribute('data-apna-schema', String(i));
      script.textContent = JSON.stringify(schema);
      this.document.head.appendChild(script);
    });
  }

  scrollTo(id: string): void {
    const el = this.document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  scrollToContact(): void {
    this.scrollTo('contact');
  }

  submitForm(): void {
    if (this.isSubmitting()) return;
    this.isSubmitting.set(true);
    this.successMessage.set('');
    this.errorMessage.set('');

    this.http.post('/api/contact', this.contactData).subscribe({
      next: () => {
        this.isSubmitting.set(false);
        this.formSubmitted = true;
        this.contactData = { name: '', email: '', subject: '', message: '' };
      },
      error: () => {
        this.isSubmitting.set(false);
        this.errorMessage.set('Something went wrong. Please try again or email us directly at hello@apnainsights.com');
      }
    });
  }
}