import {
  Component, OnInit, inject, PLATFORM_ID, ChangeDetectionStrategy
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';

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

  ngOnInit(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    const onboarded = localStorage.getItem('apna_onboarded');
    setTimeout(() => {
      this.router.navigate([onboarded ? '/' : '/onboarding'], { replaceUrl: true });
    }, 2800);
  }
}
