import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { UserDashboard } from './pages/user-dashboard/user-dashboard';
import { UserHome } from './pages/user-home/user-home';
import { PostLists } from '../post/pages/post-lists/post-lists';
import { Settings } from '../admin/pages/settings/settings';
import { Home } from '../landing/pages/home/home';
import { MyShorts } from './pages/my-shorts/my-shorts';

const routes: Routes = [
  {
    path: '',
    component: UserDashboard,
    children: [
      {
        path: '',
        component: UserHome,
        title: 'ApnaInsights - Home'
      },
      {
        path: 'manage-blogs',
        component: PostLists,
        title: 'ApnaInsights - Manage Blogs'
      },
      {
        path: 'my-shorts',
        component: MyShorts,
        title: 'ApnaInsights - My Shorts'
      },
      {
        path: 'settings',
        component: Settings,
        title: 'ApnaInsights - Settings'
      },
      {
        path: 'explore-blogs',
        component: Home,
        data: { standalone: false },
        title: 'ApnaInsights - Explore Blogs'
      }
    ]
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class UserRoutingModule { }
