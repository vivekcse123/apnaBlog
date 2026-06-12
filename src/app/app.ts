import { Component, OnInit, OnDestroy, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { RouterOutlet, Router, NavigationStart, NavigationEnd, NavigationCancel, NavigationError } from '@angular/router';
import { Subscription } from 'rxjs';
import { Loader } from './shared/loader/loader';
import { Toast } from './shared/toast/toast';
import { CookieConsent } from './shared/cookie-consent/cookie-consent';
import { LoaderService } from './core/services/loader-service';
import { AliveService } from './core/services/alive-server/alive-service';
import { VisitorService } from './core/services/visitor';
import { Auth } from './core/services/auth';
import { PushNotificationService } from './core/services/push-notification.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, Loader, Toast, CookieConsent],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App implements OnInit, OnDestroy {
  loaderService = inject(LoaderService);

  private routerSub!:    Subscription;
  private aliveService   = inject(AliveService);
  private visitorService = inject(VisitorService);
  private authService    = inject(Auth);
  private platformId     = inject(PLATFORM_ID);
  private pushService    = inject(PushNotificationService);
  private aliveStarted   = false;
  private isFirstNav     = true;

  constructor(private router: Router) {}

  ngOnInit(): void {
    // Only logout if a token EXISTS but has expired — not for unauthenticated visitors
    if (isPlatformBrowser(this.platformId) && this.authService.getToken() && this.authService.isTokenExpired()) {
      this.authService.logout();
    }

    // Register service worker + restore push subscription state
    if (isPlatformBrowser(this.platformId)) {
      this.pushService.init();
    }

    this.routerSub = this.router.events.subscribe(event => {
      if (event instanceof NavigationStart) {
        if (!this.isFirstNav) {
          this.loaderService.show('overlay', 'sm');
        }
      } else if (
        event instanceof NavigationEnd ||
        event instanceof NavigationCancel ||
        event instanceof NavigationError
      ) {
        if (this.isFirstNav) {
          this.isFirstNav = false;
        } else {
          this.loaderService.hide();
        }

        if (!this.aliveStarted) {
          this.aliveStarted = true;
          this.aliveService.start();
        }

        // Track every completed navigation — deduplication handled inside trackVisit
        if (event instanceof NavigationEnd) {
          this.visitorService.trackVisit(event.urlAfterRedirects);

          // Always land a freshly-navigated page at the top. withInMemoryScrolling's
          // window.scrollTo can be undone by withViewTransitions' DOM swap, and it
          // never reaches into routed components that scroll their own host element
          // — so reset window/document scroll here, unless this navigation targets
          // an in-page anchor (let anchorScrolling handle those).
          if (isPlatformBrowser(this.platformId) && !this.router.parseUrl(event.urlAfterRedirects).fragment) {
            requestAnimationFrame(() => {
              window.scrollTo(0, 0);
              document.documentElement.scrollTop = 0;
              document.body.scrollTop = 0;
            });
          }
        }
      }
    });
  }

  ngOnDestroy(): void {
    this.routerSub.unsubscribe();
    this.aliveService.stop();
  }
}
