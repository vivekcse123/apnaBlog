import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { RouterOutlet, Router, NavigationStart, NavigationEnd, NavigationCancel, NavigationError } from '@angular/router';
import { Subscription } from 'rxjs';
import { Loader } from './shared/loader/loader';
import { LoaderService } from './core/services/loader-service';
import { AliveService } from './core/services/alive-server/alive-service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, Loader],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App implements OnInit, OnDestroy {
  loaderService = inject(LoaderService);
  loaderSize: 'sm' | 'md' | 'lg' = 'md';

  private routerSub!: Subscription;
  private aliveService = inject(AliveService);

  constructor(private router: Router) {}

  ngOnInit(): void {
    this.routerSub = this.router.events.subscribe(event => {
      if (event instanceof NavigationStart) {
        this.loaderService.show();
      }

      if (
        event instanceof NavigationEnd ||
        event instanceof NavigationCancel ||
        event instanceof NavigationError
      ) {
        this.loaderService.hide();
      }

      this.aliveService.start();
    });
  }

  ngOnDestroy(): void {
    this.routerSub.unsubscribe();
  }
}