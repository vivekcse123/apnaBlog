import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { SuperAdminDashboard } from './pages/super-admin-dashboard/super-admin-dashboard';
import { SuperAdminHome } from './pages/super-admin-home/super-admin-home';
import { RoleManagement } from './pages/role-management/role-management';
import { ManageTaxonomy } from './pages/manage-taxonomy/manage-taxonomy';
import { ManageUsers } from '../admin/pages/manage-users/manage-users';
import { PostLists } from '../post/pages/post-lists/post-lists';
import { CreatePost } from '../post/pages/create-post/create-post';
import { Settings } from '../admin/pages/settings/settings';
import { Visitor } from '../admin/pages/visitor/visitor';
import { ManageShorts } from '../admin/pages/manage-shorts/manage-shorts';
import { ManageCallbackRequests } from '../admin/pages/manage-callback-requests/manage-callback-requests';
import { ManageMentorApplications } from '../admin/pages/manage-mentor-applications/manage-mentor-applications';
import { ManageMentors } from '../admin/pages/manage-mentors/manage-mentors';
import { ManageMessages } from '../admin/pages/manage-messages/manage-messages';

const routes: Routes = [
  {
    path: '',
    component: SuperAdminDashboard,
    children: [
      { path: '', component: SuperAdminHome, title: 'ApnaInsights - Super Admin Dashboard' },
      { path: 'role-management', component: RoleManagement, title: 'ApnaInsights - Role Management' },
      { path: 'manage-users', component: ManageUsers, title: 'ApnaInsights - Manage Users' },
      { path: 'manage-blogs', component: PostLists, title: 'ApnaInsights - Manage Blogs' },
      { path: 'create-blog', component: CreatePost, title: 'ApnaInsights - Create Blog' },
      { path: 'manage-shorts', component: ManageShorts, title: 'ApnaInsights - Manage Shorts' },
      { path: 'taxonomy', component: ManageTaxonomy, title: 'ApnaInsights - Taxonomy Manager' },
      { path: 'manage-taxonomy', component: ManageTaxonomy, title: 'ApnaInsights - Taxonomy Manager' },
      { path: 'settings', component: Settings, title: 'ApnaInsights - Settings' },
      { path: 'visitor', component: Visitor, title: 'ApnaInsights - Visitor' },
      { path: 'career-guides/callback-requests', component: ManageCallbackRequests, title: 'ApnaInsights - Callback Requests' },
      { path: 'career-guides/mentor-applications', component: ManageMentorApplications, title: 'ApnaInsights - Mentor Applications' },
      { path: 'career-guides/mentors', component: ManageMentors, title: 'ApnaInsights - Manage Mentors' },
      { path: 'messages', component: ManageMessages, title: 'ApnaInsights - Messages' },
    ]
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class SuperAdminRoutingModule {}
