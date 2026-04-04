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
    title: 'ApnaBlogs - About'
  },
  {
    path: 'blog/:id',
    component: BlogDetail,
    data : {
      title: 'Blog Post',
      description: 'Read our latest blog post'
    }
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class LandingRoutingModule { }
