import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { RouterOutlet, Router, NavigationStart, NavigationEnd, NavigationCancel, NavigationError } from '@angular/router';
import { Subscription } from 'rxjs';
import { Loader } from './shared/loader/loader';
import { Toast } from './shared/toast/toast';
import { LoaderService } from './core/services/loader-service';
import { AliveService } from './core/services/alive-server/alive-service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, Loader, Toast],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App implements OnInit, OnDestroy {
  loaderService = inject(LoaderService);

  private routerSub!: Subscription;
  private aliveService = inject(AliveService);
  private aliveStarted = false;

  constructor(private router: Router) {}

  ngOnInit(): void {
    this.routerSub = this.router.events.subscribe(event => {
      if (event instanceof NavigationStart) {
        this.loaderService.show('overlay', 'sm');
      } else if (
        event instanceof NavigationEnd ||
        event instanceof NavigationCancel ||
        event instanceof NavigationError
      ) {
        this.loaderService.hide();

        // Start alive-service only once after first successful navigation
        if (!this.aliveStarted) {
          this.aliveStarted = true;
          this.aliveService.start();
        }
      }
    });
  }

  ngOnDestroy(): void {
    this.routerSub.unsubscribe();
  }
}