import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { UserDashboardComponent } from './user-dashboard/user-dashboard.component';
import { CreateBlogComponent } from './create-blog/create-blog.component';
import { BlogDetailsComponent } from './blog-details/blog-details.component';
import { ProfileComponent } from './profile/profile.component';
import { BlogListComponent } from './blog-list/blog-list.component';

const routes: Routes = [
  {
    path: '',
    component: UserDashboardComponent,
    children: [
      { path: '', redirectTo: 'my-blogs', pathMatch: 'full' },
      { path: 'my-blogs', component: BlogListComponent },
      { path: 'create-blog', component: CreateBlogComponent },
      { path: 'profile', component: ProfileComponent },
      { path: 'blog-details/:id', component: BlogDetailsComponent }
    ]
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class UserRoutingModule { }
