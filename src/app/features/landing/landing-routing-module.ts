import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { Home } from './pages/home/home';
import { About } from './pages/about/about';
import { BlogDetail } from './pages/blog-detail/blog-detail';

const routes: Routes = [
  {
    path: '',
    component: Home
  },
  {
    path: 'about',
    component: About,
    title: 'ApnaInsights - About'
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class LandingRoutingModule { }
