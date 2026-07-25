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
  private timerId: ReturnType<typeof setTimeout> | null = null;

  ngOnInit(): void {
    this.titleSvc.setTitle('ApnaInsights');
    this.meta.updateTag({ name: 'robots', content: 'noindex, nofollow' });
    if (!isPlatformBrowser(this.platformId)) return;

    this.timerId = setTimeout(() => this.proceed(), 2800);
  }

  skip(): void {
    if (this.timerId !== null) clearTimeout(this.timerId);
    this.proceed();
  }

  private proceed(): void {
    const onboarded = localStorage.getItem('apna_onboarded');
    this.router.navigate([onboarded ? '/' : '/onboarding'], { replaceUrl: true });
  }
}
