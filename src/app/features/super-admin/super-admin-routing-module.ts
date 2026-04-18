import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { SuperAdminDashboard } from './pages/super-admin-dashboard/super-admin-dashboard';
import { SuperAdminHome } from './pages/super-admin-home/super-admin-home';
import { RoleManagement } from './pages/role-management/role-management';
import { ManageUsers } from '../admin/pages/manage-users/manage-users';
import { PostLists } from '../post/pages/post-lists/post-lists';
import { Settings } from '../admin/pages/settings/settings';
import { Visitor } from '../admin/pages/visitor/visitor';

const routes: Routes = [
  {
    path: '',
    component: SuperAdminDashboard,
    children: [
      { path: '', component: SuperAdminHome, title: 'ApnaInsights - Super Admin' },
      { path: 'role-management', component: RoleManagement, title: 'ApnaInsights - Role Management' },
      { path: 'manage-users', component: ManageUsers, title: 'ApnaInsights - Manage Users' },
      { path: 'manage-blogs', component: PostLists, title: 'ApnaInsights - Manage Blogs' },
      { path: 'settings', component: Settings, title: 'ApnaInsights - Settings' },
      { path: 'visitor', component: Visitor, title: 'ApnaInsights - Visitor' },
    ]
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class SuperAdminRoutingModule {}
