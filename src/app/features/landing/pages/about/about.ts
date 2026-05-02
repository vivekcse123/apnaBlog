import { Component, OnInit, OnDestroy, inject, signal, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Meta, Title } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule, NgForm } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { ContactService } from '../../../../core/services/contact-service';

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

  private meta           = inject(Meta);
  private title          = inject(Title);
  private document       = inject(DOCUMENT);
  private contactService = inject(ContactService);
  private platformId     = inject(PLATFORM_ID);

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

  activeTestimonial = signal(0);
  private carouselTimer: ReturnType<typeof setInterval> | null = null;

  testimonials = [
    {
      initials: 'RP', name: 'Ravi Prasad', location: 'Hyderabad, Telangana',
      quote: 'ApnaInsights gave me the platform I always needed. As a farmer from rural Telangana, I never thought my stories about village agriculture would reach thousands of readers. This platform truly lives up to its name.'
    },
    {
      initials: 'SM', name: 'Sneha Mehta', location: 'Pune, Maharashtra',
      quote: 'The editor is so clean and easy to use. I\'ve tried other blogging platforms but ApnaInsights feels like it was made specifically for the Indian blogger. The community here is warm and supportive.'
    },
    {
      initials: 'VV', name: 'Virat Verma', location: 'Lucknow, U.P',
      quote: 'I started sharing my health journey on ApnaInsights and the response was overwhelming. The trending algorithm actually works — my posts reached people who needed them most. Highly recommend to every Indian writer.'
    },
    {
      initials: 'AS', name: 'Arjun Sharma', location: 'New Delhi',
      quote: 'As a tech enthusiast, I was looking for a platform that understood Indian readers. ApnaInsights nailed it — the categories are spot on, the reach is real, and writing here feels like talking to your own community.'
    },
    {
      initials: 'PM', name: 'Priya Malhotra', location: 'Bangalore, Karnataka',
      quote: 'I write about fitness and healthy living, and the Exercise and Lifestyle categories on ApnaInsights helped me find exactly the right audience. The dark mode is a bonus — I write late at night!'
    }
  ];

  goToTestimonial(index: number): void {
    this.activeTestimonial.set(index);
    this.startCarousel();
  }

  startCarousel(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    this.stopCarousel();
    this.carouselTimer = setInterval(() => {
      this.activeTestimonial.update(i => (i + 1) % this.testimonials.length);
    }, 4500);
  }

  stopCarousel(): void {
    if (this.carouselTimer) {
      clearInterval(this.carouselTimer);
      this.carouselTimer = null;
    }
  }

  faqs: FAQ[] = [
    {
      q: 'What is ApnaInsights?',
      a: 'ApnaInsights is India\'s community-first blogging platform where real people share real experiences. Writers publish stories across 14 categories including technology, lifestyle, health, business, education, sports, village life and more. The platform has 2K+ stories, 800+ active writers, and 12K+ monthly readers.'
    },
    {
      q: 'Is ApnaInsights free to use?',
      a: 'Yes, ApnaInsights is completely free to read and write. Any registered user can publish stories, engage with the community, and access all platform features at no cost no hidden fees, no premium paywalls.'
    },
    {
      q: 'How do I start writing on ApnaInsights?',
      a: 'Simply sign up for a free account, then click "Write a Story" to access our rich blog editor. You can publish across 14 categories: Update, News, Sports, Technology, Lifestyle, Education, Health, Business, Entertainment, Social, Village, Cooking, Quotes and Exercise.'
    },
    {
      q: 'Who founded ApnaInsights?',
      a: 'ApnaInsights was founded by Vivek Verma (Founder & Lead Engineer) and Kondra Revathi Satya (CEO). Both are B.Tech graduates with a passion for building technology that empowers Indian communities.'
    },
    {
      q: 'What categories can I write about on ApnaInsights?',
      a: 'ApnaInsights supports 14 content categories: Update, News, Sports, Technology, Lifestyle, Education, Health, Business, Entertainment, Social, Village, Cooking, Quotes and Exercise. Each category has a dedicated feed and trending algorithm.'
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
    this.startCarousel();
  }

  ngOnDestroy(): void {
    this.stopCarousel();
    const scripts = this.document.querySelectorAll('script[data-apna-schema]');
    scripts.forEach(s => s.remove());
  }

  private setMetaTags(): void {

    this.title.setTitle('About ApnaInsights | Community Blogging Platform Built for India');

    this.meta.updateTag({ name: 'description', content: 'ApnaInsights is India\'s community-first blogging platform. Publish stories across 14 categories — technology, lifestyle, health, business, village life and more. 2K+ stories, 800+ writers, 12K+ monthly readers. Free to write, free to read.' });
    this.meta.updateTag({ name: 'keywords', content: 'ApnaInsights, Indian blogging platform, write blogs online India, community blogging, publish stories India, blog writing platform, free blogging India, blog platform Telugu, Hindi blog platform' });
    this.meta.updateTag({ name: 'robots', content: 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1' });
    this.meta.updateTag({ name: 'author', content: 'Vivek Verma, ApnaInsights' });
    this.meta.updateTag({ name: 'language', content: 'English' });
    this.meta.updateTag({ name: 'geo.region', content: 'IN' });
    this.meta.updateTag({ name: 'geo.country', content: 'India' });

    this.meta.updateTag({ property: 'og:type', content: 'website' });
    this.meta.updateTag({ property: 'og:title', content: 'About ApnaInsights | Community Blogging Platform Built for India' });
    this.meta.updateTag({ property: 'og:description', content: 'ApnaInsights is India\'s community-first blogging platform where real people share real experiences. 2K+ stories, 800+ active writers, 12K+ monthly readers.' });
    this.meta.updateTag({ property: 'og:url', content: 'https://apnainsights.com/about' });
    this.meta.updateTag({ property: 'og:site_name', content: 'ApnaInsights' });
    this.meta.updateTag({ property: 'og:image', content: 'https://apnainsights.com/og-image.png' });
    this.meta.updateTag({ property: 'og:image:width', content: '1200' });
    this.meta.updateTag({ property: 'og:image:height', content: '630' });
    this.meta.updateTag({ property: 'og:image:alt', content: 'ApnaInsights - Community Blogging Platform for India' });
    this.meta.updateTag({ property: 'og:locale', content: 'en_IN' });

    this.meta.updateTag({ name: 'twitter:card', content: 'summary_large_image' });
    this.meta.updateTag({ name: 'twitter:title', content: 'About ApnaInsights | Community Blogging Platform' });
    this.meta.updateTag({ name: 'twitter:description', content: 'India\'s community-first blogging platform. Write, share, and connect. 10K+ stories published. Free to join.' });
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
            name: 'About ApnaInsights | Community Blogging Platform Built for India',
            description: 'Learn about ApnaInsights, India\'s community-first blogging platform. Meet the team, discover our mission, and find out how we empower writers across India.',
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

      {
        '@context': 'https://schema.org',
        '@type': 'ItemList',
        name: 'ApnaInsights Community Reviews',
        itemListElement: [
          {
            '@type': 'ListItem',
            position: 1,
            item: {
              '@type': 'Review',
              '@id': 'https://apnainsights.com/about#review-1',
              itemReviewed: {
                '@type': 'Organization',
                '@id': 'https://apnainsights.com/#organization',
                name: 'ApnaInsights',
                url: 'https://apnainsights.com'
              },
              reviewRating: {
                '@type': 'Rating',
                ratingValue: '5',
                bestRating: '5',
                worstRating: '1'
              },
              reviewBody: 'ApnaInsights gave me the platform I always needed. As a farmer from rural Telangana, I never thought my stories about village agriculture would reach thousands of readers. This platform truly lives up to its name.',
              author: {
                '@type': 'Person',
                name: 'Ravi Prasad'
              },
              publisher: {
                '@id': 'https://apnainsights.com/#organization'
              }
            }
          },
          {
            '@type': 'ListItem',
            position: 2,
            item: {
              '@type': 'Review',
              '@id': 'https://apnainsights.com/about#review-2',
              itemReviewed: {
                '@type': 'Organization',
                '@id': 'https://apnainsights.com/#organization',
                name: 'ApnaInsights',
                url: 'https://apnainsights.com'
              },
              reviewRating: {
                '@type': 'Rating',
                ratingValue: '5',
                bestRating: '5',
                worstRating: '1'
              },
              reviewBody: 'The editor is so clean and easy to use. I\'ve tried other blogging platforms but ApnaInsights feels like it was made specifically for the Indian blogger. The community here is warm and supportive.',
              author: {
                '@type': 'Person',
                name: 'Sneha Mehta'
              },
              publisher: {
                '@id': 'https://apnainsights.com/#organization'
              }
            }
          },
          {
            '@type': 'ListItem',
            position: 3,
            item: {
              '@type': 'Review',
              '@id': 'https://apnainsights.com/about#review-3',
              itemReviewed: {
                '@type': 'Organization',
                '@id': 'https://apnainsights.com/#organization',
                name: 'ApnaInsights',
                url: 'https://apnainsights.com'
              },
              reviewRating: {
                '@type': 'Rating',
                ratingValue: '5',
                bestRating: '5',
                worstRating: '1'
              },
              reviewBody: 'I started sharing my health journey on ApnaInsights and the response was overwhelming. The trending algorithm actually works — my posts reached people who needed them most. Highly recommend to every Indian writer.',
              author: {
                '@type': 'Person',
                name: 'Virat Verma'
              },
              publisher: {
                '@id': 'https://apnainsights.com/#organization'
              }
            }
          }
        ]
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

    this.contactService.sendMessage(this.contactData).subscribe({
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