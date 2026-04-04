import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { AdminHome } from './pages/admin-home/admin-home';
import { AdminDashboard } from './pages/admin-dashboard/admin-dashboard';
import { ManageUsers } from './pages/manage-users/manage-users';
import { PostLists } from '../post/pages/post-lists/post-lists';
import { CreatePost } from '../post/pages/create-post/create-post';
import { CreateUser } from './pages/create-user/create-user';
import { Settings } from './pages/settings/settings';
import { Visitor } from './pages/visitor/visitor';

const routes: Routes = [
  {
    path: '',
    component: AdminDashboard,
    children: [
      {
        path: '',
        component: AdminHome,
        title: 'ApnaBlogs - Home'
      },
      {
        path: 'manage-users',
        component: ManageUsers,
        title: 'ApnaBlogs - Manage Users'
      },
      {
        path: 'manage-blogs',
        component: PostLists,
        title: "ApnaBlogs - Manage Blogs"
      },
      {
        path: 'create-blog',
        component: CreatePost,
        title: 'ApnaBlogs - Create Blog'
      },
      {
        path: 'create-user',
        component: CreateUser,
        title: 'ApnaBlogs - Create User'
      },
      {
        path: 'settings',
        component: Settings,
        title: 'ApnaBlogs - Settings'
      },
      {
        path: 'visitor',
        component: Visitor,
        title: "ApnaBlogs - Visitor"
      }
    ]
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class AdminRoutingModule { }
