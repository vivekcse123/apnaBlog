import {
  Component, OnInit, inject, PLATFORM_ID, ChangeDetectionStrategy
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';
import { Meta, Title } from '@angular/platform-browser';

@Component({
  selector: 'app-splash',
  standalone: true,
  templateUrl: './splash.html',
  styleUrl: './splash.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SplashScreen implements OnInit {
  private router     = inject(Router);
  private platformId = inject(PLATFORM_ID);
  private meta       = inject(Meta);
  private titleSvc   = inject(Title);

  ngOnInit(): void {
    this.titleSvc.setTitle('ApnaInsights');
    this.meta.updateTag({ name: 'robots', content: 'noindex, nofollow' });
    if (!isPlatformBrowser(this.platformId)) return;

    const onboarded = localStorage.getItem('apna_onboarded');
    setTimeout(() => {
      this.router.navigate([onboarded ? '/' : '/onboarding'], { replaceUrl: true });
    }, 2800);
  }
}
