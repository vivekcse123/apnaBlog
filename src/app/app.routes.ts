import { Routes } from '@angular/router';
import { BlogFeedComponent } from './shared/blog-feed/blog-feed.component';
import { FestivalFeed } from './shared/festival-feed/festival-feed';

export const routes: Routes = [
  {
    path: 'welcome-dashboard',
    loadComponent: () => import('./shared/welcome-dashboard/welcome-dashboard.component')
      .then(m => m.WelcomeDashboardComponent)
  },
  {
    path: '',
    redirectTo: 'welcome-dashboard',
    pathMatch: 'full'
  },
  {
    path: 'blog-feed', component: BlogFeedComponent
  },
  {
    path: 'festival-feed', component: FestivalFeed
  },
  {
    path: 'auth',
    loadChildren: () => import('./auth/auth.module').then(m => m.AuthModule)
  },
  {
    path: 'user-dashboard',
    loadChildren: () => import('./user/user.module').then(m => m.UserModule)
  }
];
