import { Component, OnInit, OnDestroy } from '@angular/core';
import { RouterOutlet, Router, NavigationStart, NavigationEnd, NavigationCancel, NavigationError } from '@angular/router';
import { Subscription } from 'rxjs';
import { Loader } from './shared/loader/loader';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, Loader],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App implements OnInit, OnDestroy {
  loading = false;
  loaderSize: 'sm' | 'md' | 'lg' = 'md';

  private routerSub!: Subscription;

  constructor(private router: Router) {}

  ngOnInit(): void {
    this.routerSub = this.router.events.subscribe(event => {
      if (event instanceof NavigationStart) {
        this.loading = true;
      }

      if (
        event instanceof NavigationEnd ||
        event instanceof NavigationCancel ||
        event instanceof NavigationError
      ) {
        this.loading = false;
      }
    });
  }

  ngOnDestroy(): void {
    this.routerSub.unsubscribe();
  }
}