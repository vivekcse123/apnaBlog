import {
  ChangeDetectionStrategy, Component, OnDestroy, OnInit, PLATFORM_ID, inject, signal
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Meta, Title } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule, NgForm } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { ContactService } from '../../../../core/services/contact-service';
import { MobileBottomNav } from '../../../../shared/mobile-bottom-nav/mobile-bottom-nav';
import { Auth } from '../../../../core/services/auth';

interface ContactData {
  name: string;
  email: string;
  subject: string;
  message: string;
}

@Component({
  selector: 'app-contact',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, FormsModule, CommonModule, MobileBottomNav],
  templateUrl: './contact.html',
  styleUrl: './contact.css'
})
export class Contact implements OnInit, OnDestroy {

  private meta           = inject(Meta);
  private title          = inject(Title);
  private document       = inject(DOCUMENT);
  private contactService = inject(ContactService);
  private platformId     = inject(PLATFORM_ID);
  private auth           = inject(Auth);

  navMenuOpen = false;
  formSubmitted = false;
  currentYear = new Date().getFullYear();

  isSubmitting  = signal(false);
  successMessage = signal('');
  errorMessage   = signal('');

  get isLoggedIn(): boolean    { return this.auth.isAuthorized(); }
  get dashboardRoute(): string {
    const role = this.auth.userRole() ?? 'user';
    const id   = this.auth.userId()   ?? '';
    if (role === 'admin')       return `/admin/${id}`;
    if (role === 'super_admin') return `/super-admin/${id}`;
    return `/user/${id}/profile`;
  }

  contactData: ContactData = {
    name: '',
    email: '',
    subject: '',
    message: ''
  };

  ngOnInit(): void {
    this.setMetaTags();
    this.injectJsonLd();
  }

  ngOnDestroy(): void {
    const scripts = this.document.querySelectorAll('script[data-contact-schema]');
    scripts.forEach(s => s.remove());
  }

  private setMetaTags(): void {
    this.title.setTitle('Contact Us | ApnaInsights');

    this.meta.updateTag({ name: 'description', content: 'Get in touch with ApnaInsights. Have a story idea, partnership proposal, or support question? We respond within 24 hours. Email us at hello@apnainsights.com.' });
    this.meta.updateTag({ name: 'keywords', content: 'contact ApnaInsights, ApnaInsights support, ApnaInsights email, reach ApnaInsights, partnership ApnaInsights' });
    this.meta.updateTag({ name: 'robots', content: 'index, follow' });

    this.meta.updateTag({ property: 'og:type', content: 'website' });
    this.meta.updateTag({ property: 'og:title', content: 'Contact Us | ApnaInsights' });
    this.meta.updateTag({ property: 'og:description', content: 'Get in touch with the ApnaInsights team. We respond within 24 hours.' });
    this.meta.updateTag({ property: 'og:url', content: 'https://apnainsights.com/contact' });
    this.meta.updateTag({ property: 'og:site_name', content: 'ApnaInsights' });
    this.meta.updateTag({ property: 'og:image', content: 'https://apnainsights.com/og-image.png' });

    this.meta.updateTag({ name: 'twitter:card', content: 'summary_large_image' });
    this.meta.updateTag({ name: 'twitter:title', content: 'Contact Us | ApnaInsights' });
    this.meta.updateTag({ name: 'twitter:description', content: 'Get in touch with the ApnaInsights team.' });
    this.meta.updateTag({ name: 'twitter:site', content: '@apnainsights' });

    let canonical = this.document.querySelector('link[rel="canonical"]') as HTMLLinkElement;
    if (!canonical) {
      canonical = this.document.createElement('link');
      canonical.setAttribute('rel', 'canonical');
      this.document.head.appendChild(canonical);
    }
    canonical.setAttribute('href', 'https://apnainsights.com/contact');
  }

  private injectJsonLd(): void {
    if (this.document.querySelector('script[data-contact-schema]')) return;

    const schema = {
      '@context': 'https://schema.org',
      '@type': 'ContactPage',
      name: 'Contact ApnaInsights',
      url: 'https://apnainsights.com/contact',
      description: 'Get in touch with ApnaInsights – India\'s free knowledge platform for professionals.',
      mainEntity: {
        '@type': 'Organization',
        name: 'ApnaInsights',
        url: 'https://apnainsights.com',
        contactPoint: [
          { '@type': 'ContactPoint', contactType: 'customer support', email: 'supports@apnainsights.com', availableLanguage: ['English', 'Hindi'] },
          { '@type': 'ContactPoint', contactType: 'general inquiry', email: 'hello@apnainsights.com' }
        ]
      }
    };

    const script = this.document.createElement('script');
    script.type = 'application/ld+json';
    script.setAttribute('data-contact-schema', '0');
    script.textContent = JSON.stringify(schema);
    this.document.head.appendChild(script);
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
