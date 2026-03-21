import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { AdminHome } from './pages/admin-home/admin-home';
import { AdminDashboard } from './pages/admin-dashboard/admin-dashboard';
import { ManageUsers } from './pages/manage-users/manage-users';
import { PostLists } from '../post/pages/post-lists/post-lists';
import { CreatePost } from '../post/pages/create-post/create-post';
import { CreateUser } from './pages/create-user/create-user';
import { Settings } from './pages/settings/settings';

const routes: Routes = [
  {
    path: ':id',
    component: AdminDashboard,
    children: [
      {
        path: '',
        component: AdminHome
      },
      {
        path: 'manage-users',
        component: ManageUsers
      },
      {
        path: 'manage-blogs',
        component: PostLists
      },
      {
        path: 'create-blog',
        component: CreatePost
      },
      {
        path: 'create-user',
        component: CreateUser
      },
      {
        path: 'settings',
        component: Settings
      }
    ]
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class AdminRoutingModule { }
