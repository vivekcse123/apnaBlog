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
import { ManageShorts } from './pages/manage-shorts/manage-shorts';
import { ManageSubscribers } from './pages/manage-subscribers/manage-subscribers';
import { SponsoredReport } from './pages/sponsored-report/sponsored-report';
import { NewsFeed }          from './pages/news-feed/news-feed';
import { ManageChallenges } from './pages/manage-challenges/manage-challenges';
import { ManageFlags }      from './pages/manage-flags/manage-flags';

const routes: Routes = [
  {
    path: '',
    component: AdminDashboard,
    children: [
      {
        path: '',
        component: AdminHome,
        title: 'ApnaInsights - Home'
      },
      {
        path: 'manage-users',
        component: ManageUsers,
        title: 'ApnaInsights - Manage Users'
      },
      {
        path: 'manage-blogs',
        component: PostLists,
        title: "ApnaInsights - Manage Blogs"
      },
      {
        path: 'create-blog',
        component: CreatePost,
        title: 'ApnaInsights - Create Blog'
      },
      {
        path: 'create-user',
        component: CreateUser,
        title: 'ApnaInsights - Create User'
      },
      {
        path: 'settings',
        component: Settings,
        title: 'ApnaInsights - Settings'
      },
      {
        path: 'visitor',
        component: Visitor,
        title: "ApnaInsights - Visitor"
      },
      {
        path: 'manage-shorts',
        component: ManageShorts,
        title: 'ApnaInsights - Manage Shorts'
      },
      {
        path: 'subscribers',
        component: ManageSubscribers,
        title: 'ApnaInsights - Newsletter Subscribers'
      },
      {
        path: 'sponsored-report',
        component: SponsoredReport,
        title: 'ApnaInsights - Sponsored Report'
      },
      {
        path: 'news-feed',
        component: NewsFeed,
        title: 'ApnaInsights - News Feed'
      },
      {
        path: 'challenges',
        component: ManageChallenges,
        title: 'ApnaInsights - Manage Challenges'
      },
      {
        path: 'flags',
        component: ManageFlags,
        title: 'ApnaInsights - Community Flags'
      }
    ]
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class AdminRoutingModule { }
