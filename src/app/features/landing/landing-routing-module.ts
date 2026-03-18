import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { Home } from './pages/home/home';

const routes: Routes = [
  {
    path: '',
    redirectTo: 'apna-blog',
    pathMatch: 'full'
  },
  {
    path: 'apna-blog',
    component: Home
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class LandingRoutingModule { }
