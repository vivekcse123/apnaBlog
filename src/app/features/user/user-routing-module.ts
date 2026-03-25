import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { UserDashboard } from './pages/user-dashboard/user-dashboard';
import { UserHome } from './pages/user-home/user-home';
import { PostLists } from '../post/pages/post-lists/post-lists';
import { Settings } from '../admin/pages/settings/settings';
import { Home } from '../landing/pages/home/home';

const routes: Routes = [
  {
    path: ':id',
    component: UserDashboard,
    children: [
      {
        path: '',
        component: UserHome
      },
      {
        path: 'manage-blogs',
        component: PostLists
      },
      {
        path: 'settings',
        component: Settings
      },
      {
        path: 'explore-blogs',
        component: Home,
        data: { standalone: false }
      }
    ]
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class UserRoutingModule { }
