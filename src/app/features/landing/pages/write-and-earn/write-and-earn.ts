import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Meta, Title } from '@angular/platform-browser';
import { environment } from '../../../../../environments/environment';
import { Auth } from '../../../../core/services/auth';
import { MobileBottomNav } from '../../../../shared/mobile-bottom-nav/mobile-bottom-nav';

@Component({
  selector: 'app-write-and-earn',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, MobileBottomNav],
  templateUrl: './write-and-earn.html',
  styleUrl: './write-and-earn.css',
})
export class WriteAndEarn implements OnInit {
  private auth     = inject(Auth);
  private meta     = inject(Meta);
  private titleSvc = inject(Title);
  private document = inject(DOCUMENT);

  navMenuOpen = false;
  currentYear = new Date().getFullYear();

  get startWritingRoute(): string {
    const id   = this.auth.userId();
    const role = this.auth.userRole();
    if (!this.auth.isAuthorized() || !id) return '/auth/login';
    if (role === 'admin')       return `/admin/${id}`;
    if (role === 'super_admin') return `/super-admin/${id}`;
    if (role === 'sponsor')     return `/sponsor/${id}`;
    return `/user/${id}`;
  }

  readonly badges = [
    { icon: '✍️', label: 'First Story',          desc: 'Publish your first blog' },
    { icon: '📚', label: 'Storyteller',          desc: 'Publish 5+ stories' },
    { icon: '🏆', label: 'Prolific Writer',      desc: 'Publish 10+ stories' },
    { icon: '👁️', label: '100 Views',            desc: 'Reach 100 total views' },
    { icon: '🚀', label: '1K Views',             desc: 'Reach 1,000 total views' },
    { icon: '❤️', label: 'Crowd Pleaser',        desc: 'Receive 10+ likes' },
    { icon: '🤝', label: 'Community Builder',    desc: 'Gain 5+ followers' },
    { icon: '💬', label: 'Conversation Starter', desc: 'Receive 5+ comments' },
  ];

  readonly steps = [
    { num: 1, title: 'Publish', desc: 'Write and publish a post in any of our categories - Technology, Career, AI and more.' },
    { num: 2, title: 'Earn Karma', desc: 'Every publish, like, and comment your writing receives adds to your Writer Karma score.' },
    { num: 3, title: 'Get Recognized', desc: 'Unlock achievement badges, climb challenge leaderboards, and get featured across the platform.' },
  ];

  ngOnInit(): void { this.setMeta(); }

  private setMeta(): void {
    const url  = `${environment.siteUrl}/write-and-earn`;
    const desc = 'Write on ApnaInsights and build your Writer Karma - earn achievement badges, compete in writing challenges, and get featured for great content.';

    this.titleSvc.setTitle('Write & Earn | ApnaInsights');
    this.meta.updateTag({ name: 'description', content: desc });
    this.meta.updateTag({ name: 'robots', content: 'index, follow' });
    this.meta.updateTag({ property: 'og:type',        content: 'website' });
    this.meta.updateTag({ property: 'og:title',       content: 'Write & Earn | ApnaInsights' });
    this.meta.updateTag({ property: 'og:description', content: desc });
    this.meta.updateTag({ property: 'og:url',         content: url });
    this.meta.updateTag({ property: 'og:site_name',   content: 'ApnaInsights' });
    this.meta.updateTag({ name: 'twitter:card',        content: 'summary_large_image' });
    this.meta.updateTag({ name: 'twitter:title',       content: 'Write & Earn | ApnaInsights' });
    this.meta.updateTag({ name: 'twitter:description', content: desc });

    let canonical = this.document.querySelector('link[rel="canonical"]') as HTMLLinkElement;
    if (!canonical) {
      canonical = this.document.createElement('link');
      canonical.setAttribute('rel', 'canonical');
      this.document.head.appendChild(canonical);
    }
    canonical.setAttribute('href', url);
  }
}
