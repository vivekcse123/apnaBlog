import { Component, OnInit, OnDestroy, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { RouterOutlet, Router, NavigationStart, NavigationEnd, NavigationCancel, NavigationError, NavigationSkipped } from '@angular/router';
import { Subscription } from 'rxjs';
import { Loader } from './shared/loader/loader';
import { Toast } from './shared/toast/toast';
import { CookieConsent } from './shared/cookie-consent/cookie-consent';
import { AiAssistant } from './shared/ai-assistant/ai-assistant';
import { LoaderService } from './core/services/loader-service';
import { AliveService } from './core/services/alive-server/alive-service';
import { VisitorService } from './core/services/visitor';
import { Auth } from './core/services/auth';
import { PushNotificationService } from './core/services/push-notification.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, Loader, Toast, CookieConsent, AiAssistant],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App implements OnInit, OnDestroy {
  loaderService = inject(LoaderService);

  private routerSub!:    Subscription;
  private pendingNavIds  = new Set<number>();
  private aliveService   = inject(AliveService);
  private visitorService = inject(VisitorService);
  private authService    = inject(Auth);
  private platformId     = inject(PLATFORM_ID);
  private pushService    = inject(PushNotificationService);
  private aliveStarted   = false;
  private isFirstNav     = true;

  constructor(private router: Router) {}

  ngOnInit(): void {
    // Only logout if a token EXISTS but has expired - not for unauthenticated visitors
    if (isPlatformBrowser(this.platformId) && this.authService.getToken() && this.authService.isTokenExpired()) {
      this.authService.logout();
    }

    // A PWA cold start (installed app launched from a home-screen icon, per
    // the manifest's start_url '/?source=pwa' + display:'standalone') sees
    // the splash/onboarding flow once. Deliberately scoped to real PWA
    // launches only - detected via display-mode:standalone or the ?source=pwa
    // param, not "any first-time browser visitor" - so an ordinary browser
    // tab (including search engine crawlers, which don't carry localStorage
    // between visits and would otherwise get redirected on every single
    // crawl) always sees the real homepage. Checked here (app bootstrap),
    // not in a route guard, so it never runs against the prerendered '/'
    // route during SSR/build, and never re-fires on in-app navigation back
    // to '/' after ngOnInit's first pass.
    if (
      isPlatformBrowser(this.platformId) &&
      window.location.pathname === '/' &&
      !localStorage.getItem('apna_onboarded') &&
      (window.matchMedia('(display-mode: standalone)').matches || new URLSearchParams(window.location.search).get('source') === 'pwa')
    ) {
      this.router.navigate(['/splash'], { replaceUrl: true });
    }

    // Register service worker + restore push subscription state
    if (isPlatformBrowser(this.platformId)) {
      this.pushService.init();
    }

    this.routerSub = this.router.events.subscribe(event => {
      if (event instanceof NavigationStart) {
        if (!this.isFirstNav) {
          // Track by navigation id rather than a raw increment/decrement
          // counter - if two navigations overlap (e.g. a second click before
          // the first settles, which withViewTransitions() can race), each
          // still resolves to exactly one show()/hide() pair instead of the
          // counter drifting and leaving the overlay stuck forever.
          const wasIdle = this.pendingNavIds.size === 0;
          this.pendingNavIds.add(event.id);
          if (wasIdle) this.loaderService.show('overlay', 'sm');
        }
      } else if (
        event instanceof NavigationEnd ||
        event instanceof NavigationCancel ||
        event instanceof NavigationError ||
        event instanceof NavigationSkipped
      ) {
        if (this.isFirstNav) {
          this.isFirstNav = false;
        } else {
          this.pendingNavIds.delete(event.id);
          if (this.pendingNavIds.size === 0) this.loaderService.hide();
        }

        if (!this.aliveStarted) {
          this.aliveStarted = true;
          this.aliveService.start();
        }

        // Track every completed navigation - deduplication handled inside trackVisit
        if (event instanceof NavigationEnd) {
          this.visitorService.trackVisit(event.urlAfterRedirects);
          this.authService.recordVisitedUrl(event.urlAfterRedirects);

          // Always land a freshly-navigated page at the top. withInMemoryScrolling's
          // window.scrollTo can be undone by withViewTransitions' DOM swap, and it
          // never reaches into routed components that scroll their own host element
          // - so reset window/document scroll here, unless this navigation targets
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
