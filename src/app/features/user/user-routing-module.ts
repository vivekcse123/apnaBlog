import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { UserDashboard } from './pages/user-dashboard/user-dashboard';
import { UserHome } from './pages/user-home/user-home';
import { PostLists } from '../post/pages/post-lists/post-lists';
import { CreatePost } from '../post/pages/create-post/create-post';
import { Settings } from '../admin/pages/settings/settings';
import { MyShorts } from './pages/my-shorts/my-shorts';
import { Messages } from './pages/messages/messages';
import { CallbackRequests } from './pages/callback-requests/callback-requests';
import { MentorRequests } from './pages/mentor-requests/mentor-requests';

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
        path: 'create-blog',
        component: CreatePost,
        title: 'ApnaInsights - Create Blog'
      },
      {
        path: 'my-shorts',
        component: MyShorts,
        title: 'ApnaInsights - My Shorts'
      },
      {
        path: 'messages',
        component: Messages,
        title: 'ApnaInsights - Messages'
      },
      {
        path: 'settings',
        component: Settings,
        title: 'ApnaInsights - Settings'
      },
      {
        path: 'explore-blogs',
        redirectTo: '/blog',
        pathMatch: 'full'
      },
      {
        path: 'career-guides/callback-requests',
        component: CallbackRequests,
        title: 'ApnaInsights - Callback Requests'
      },
      {
        path: 'career-guides/mentor-requests',
        component: MentorRequests,
        title: 'ApnaInsights - My Mentor Requests'
      }
    ]
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class UserRoutingModule { }
