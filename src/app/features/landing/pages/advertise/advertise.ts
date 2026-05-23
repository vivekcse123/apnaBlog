import {
  ChangeDetectionStrategy, Component, OnInit, PLATFORM_ID, inject, signal
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule, NgForm } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Meta, Title } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { environment } from '../../../../../environments/environment';

interface InquiryForm {
  company:  string;
  name:     string;
  email:    string;
  phone:    string;
  adType:   string;
  budget:   string;
  message:  string;
}

@Component({
  selector: 'app-advertise',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, FormsModule, CommonModule],
  templateUrl: './advertise.html',
  styleUrl:    './advertise.css',
})
export class Advertise implements OnInit {
  private http       = inject(HttpClient);
  private platformId = inject(PLATFORM_ID);
  private meta       = inject(Meta);
  private titleSvc   = inject(Title);
  private document   = inject(DOCUMENT);

  navMenuOpen   = false;
  submitted     = false;
  isSubmitting  = signal(false);
  errorMessage  = signal('');
  currentYear   = new Date().getFullYear();

  form: InquiryForm = {
    company: '', name: '', email: '', phone: '',
    adType: '', budget: '', message: '',
  };

  readonly packages = [
    {
      icon: '🎬',
      title: 'Sponsored Short',
      desc: 'Your brand featured in a 30–60 second short video, shown at the top of our feed to all users.',
      features: ['Feed-first placement', 'Stays live for your chosen duration', 'View count reporting'],
      highlight: true,
    },
    {
      icon: '📰',
      title: 'Blog Feature',
      desc: 'A native article published on ApnaInsights presenting your brand story, product, or service.',
      features: ['SEO-indexed content', 'Category-targeted audience', 'Evergreen visibility'],
      highlight: false,
    },
    {
      icon: '📧',
      title: 'Newsletter Mention',
      desc: 'Your brand mentioned in our subscriber newsletter sent to engaged readers.',
      features: ['High open-rate audience', 'Direct inbox reach', 'Trackable link'],
      highlight: false,
    },
    {
      icon: '📦',
      title: 'Custom Package',
      desc: 'Combine shorts, articles, and newsletter for maximum brand presence across our platform.',
      features: ['Multi-channel exposure', 'Flexible scheduling', 'Dedicated reporting'],
      highlight: false,
    },
  ];

  readonly budgets = [
    'Under ₹500', '₹500 – ₹1,000', '₹1,000 – ₹3,000',
    '₹3,000 – ₹10,000', 'Above ₹10,000', 'Let\'s discuss',
  ];

  ngOnInit(): void { this.setMeta(); }

  private setMeta(): void {
    this.titleSvc.setTitle('Advertise with ApnaInsights | Reach India\'s Digital Audience');
    this.meta.updateTag({ name: 'description', content: 'Partner with ApnaInsights — India\'s community blogging platform. Advertise via sponsored shorts, blog features, and newsletter placements. Reach engaged readers across 14 categories including Technology, Health, Sports and more.' });
    this.meta.updateTag({ name: 'keywords', content: 'advertise on ApnaInsights, sponsored content India, blog advertising India, digital advertising India, sponsored shorts, content marketing India' });
    this.meta.updateTag({ name: 'robots', content: 'index, follow' });
    this.meta.updateTag({ property: 'og:type',        content: 'website' });
    this.meta.updateTag({ property: 'og:title',       content: 'Advertise with ApnaInsights | Reach India\'s Digital Audience' });
    this.meta.updateTag({ property: 'og:description', content: 'Partner with ApnaInsights to reach engaged Indian readers. Sponsored shorts, blog features, newsletter ads — flexible packages for every budget.' });
    this.meta.updateTag({ property: 'og:url',         content: 'https://apnainsights.com/advertise' });
    this.meta.updateTag({ property: 'og:site_name',   content: 'ApnaInsights' });
    this.meta.updateTag({ property: 'og:image',       content: 'https://apnainsights.com/og-image.png' });
    this.meta.updateTag({ name: 'twitter:card',        content: 'summary_large_image' });
    this.meta.updateTag({ name: 'twitter:title',       content: 'Advertise with ApnaInsights' });
    this.meta.updateTag({ name: 'twitter:description', content: 'Reach India\'s growing digital audience. Sponsored shorts, blog features, newsletter ads.' });
    this.meta.updateTag({ name: 'twitter:image',       content: 'https://apnainsights.com/og-image.png' });

    let canonical = this.document.querySelector('link[rel="canonical"]') as HTMLLinkElement;
    if (!canonical) {
      canonical = this.document.createElement('link');
      canonical.setAttribute('rel', 'canonical');
      this.document.head.appendChild(canonical);
    }
    canonical.setAttribute('href', 'https://apnainsights.com/advertise');
  }

  readonly adTypes = [
    { value: 'sponsored_short', label: 'Sponsored Short' },
    { value: 'blog_feature',    label: 'Blog Feature / Native Article' },
    { value: 'newsletter',      label: 'Newsletter Mention' },
    { value: 'multiple',        label: 'Multiple / Custom Package' },
  ];

  submitInquiry(f: NgForm): void {
    if (f.invalid || this.isSubmitting()) return;
    this.isSubmitting.set(true);
    this.errorMessage.set('');

    this.http.post(`${environment.apiUrl}/sponsorship/inquire`, this.form).subscribe({
      next: () => {
        this.isSubmitting.set(false);
        this.submitted = true;
        f.resetForm();
        this.form = { company: '', name: '', email: '', phone: '', adType: '', budget: '', message: '' };
      },
      error: (err) => {
        this.isSubmitting.set(false);
        this.errorMessage.set(err?.error?.message ?? 'Something went wrong. Please email us at hello@apnainsights.com');
      },
    });
  }

  scrollToForm(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    this.document.getElementById('inquire')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}
