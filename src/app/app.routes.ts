import { inject } from '@angular/core';
import { Router, Routes } from '@angular/router';
import { AuthLayout } from './layouts/auth-layout/auth-layout';
import { MainLayout } from './layouts/main-layout/main-layout';
import { PageNotFound } from './shared/page-not-found/page-not-found';
import { authGuard, guestGuard } from './core/guards/auth-guard';
import { adminGuard } from './core/guards/admin-guard';
import { superAdminGuard } from './core/guards/super-admin-guard';
import { roleGuard } from './core/guards/role-guard';
import { sponsorGuard } from './core/guards/sponsor-guard';
import { mentorRedirectGuard } from './core/guards/mentor-redirect-guard';

export const routes: Routes = [
    {
        path: 'splash',
        loadComponent: () => import('./features/landing/pages/splash/splash').then(m => m.SplashScreen),
        title: 'ApnaInsights'
    },
    {
        path: 'onboarding',
        loadComponent: () => import('./features/landing/pages/onboarding/onboarding').then(m => m.Onboarding),
        title: 'Get Started | ApnaInsights'
    },
    {
        path: '',
        loadChildren: () => import('./features/landing/landing-module').then(m => m.LandingModule),
        title: 'ApnaInsights'
    },
    {
        path: 'welcome',
        redirectTo: '',
        pathMatch: 'full',
    },
     {
        path: 'about',
        loadComponent: () => import('./features/landing/pages/about/about').then(m => m.About),
        title: 'ApnaInsights - About'
    },
    {
        path: 'privacy-policy',
        loadComponent: () => import('./features/landing/pages/privacy-policy/privacy-policy').then(m => m.PrivacyPolicy),
        title: 'Privacy Policy | ApnaInsights'
    },
    {
        path: 'terms',
        loadComponent: () => import('./features/landing/pages/terms/terms').then(m => m.Terms),
        title: 'Terms of Service | ApnaInsights'
    },
    {
        path: 'disclaimer',
        loadComponent: () => import('./features/landing/pages/disclaimer/disclaimer').then(m => m.Disclaimer),
        title: 'Disclaimer | ApnaInsights'
    },
    {
        path: 'editorial-policy',
        loadComponent: () => import('./features/landing/pages/editorial-policy/editorial-policy').then(m => m.EditorialPolicy),
        title: 'Editorial Policy | ApnaInsights'
    },
    {
        path: 'advertise',
        loadComponent: () => import('./features/landing/pages/advertise/advertise').then(m => m.Advertise),
        title: 'Advertise with Us | ApnaInsights'
    },
    {
        path: 'write-and-earn',
        loadComponent: () => import('./features/landing/pages/write-and-earn/write-and-earn').then(m => m.WriteAndEarn),
        title: 'Write & Earn | ApnaInsights'
    },
    {
        // /topics was retired in favor of /blog. Redirect so old links don't 404.
        path: 'topics',
        redirectTo: '/blog',
        pathMatch: 'full',
    },
    {
        path: 'category/:category',
        loadComponent: () => import('./features/landing/pages/category-page/category-page').then(m => m.CategoryPage),
        title: 'Category | ApnaInsights'
    },
    {
        path: 'author/:id',
        loadComponent: () => import('./features/landing/pages/author-page/author-page').then(m => m.AuthorPage),
        title: 'Author | ApnaInsights'
    },
    {
        path: 'tag/:tag',
        loadComponent: () => import('./features/landing/pages/tag-page/tag-page').then(m => m.TagPage),
        title: 'Tag | ApnaInsights'
    },
    {
        path: 'history',
        loadComponent: () => import('./features/landing/pages/history/history').then(m => m.HistoryPage),
        title: 'Reading History | ApnaInsights'
    },
    {
        // The old search/browse page was retired in favor of /blog, which now
        // covers the same "browse everything, filter, sort" job. Redirect so
        // old bookmarks, shared links, and the homepage's SearchAction schema
        // still land somewhere real instead of 404ing. A plain string
        // redirectTo drops the query string, so this preserves ?q=/?sort=
        // by building the target UrlTree with the incoming queryParams.
        path: 'search',
        redirectTo: ({ queryParams }) => inject(Router).createUrlTree(['/blog'], { queryParams }),
        pathMatch: 'full',
    },
    {
        path: 'challenges',
        loadComponent: () => import('./features/landing/pages/challenges/challenges').then(m => m.ChallengesPage),
        title: 'Writing Challenges | ApnaInsights'
    },
    {
        path: 'shorts',
        loadComponent: () => import('./features/shorts/pages/shorts-feed/shorts-feed').then(m => m.ShortsFeed),
        title: 'Shorts | ApnaInsights'
    },
    {
        path: 'shorts/:id',
        loadComponent: () => import('./features/shorts/pages/short-view/short-view').then(m => m.ShortView),
        title: 'Short | ApnaInsights'
    },
    {
        path: 'bookmarks',
        loadComponent: () => import('./features/landing/pages/bookmarks/bookmarks').then(m => m.BookmarksPage),
        title: 'My Bookmarks | ApnaInsights'
    },
    {
        path: 'contact',
        loadComponent: () => import('./features/landing/pages/contact/contact').then(m => m.Contact),
        title: 'Contact Us | ApnaInsights'
    },
    {
        path: 'blog',
        loadComponent: () => import('./features/landing/pages/blog-list/blog-list').then(m => m.BlogListPage),
        title: 'All Blogs | ApnaInsights'
    },
    {
        path: 'blog/:id',
        loadComponent: () => import('./features/landing/pages/blog-detail/blog-detail').then(m => m.BlogDetail),
        data: {
            title: 'Blog Post',
            description: 'Read our latest blog post'
        }
    },
    {
        path: 'campaign/:id',
        loadComponent: () => import('./features/campaign/pages/campaign-page/campaign-page').then(m => m.CampaignPage),
        title: 'Sponsored | ApnaInsights'
    },
    {
        // Approved mentors get redirected to /career-guides/dashboard by
        // mentorRedirectGuard instead of seeing the public marketplace here.
        path: 'career-guides',
        loadComponent: () => import('./features/career-guides/pages/guide-list/guide-list').then(m => m.GuideList),
        canActivate: [mentorRedirectGuard],
        title: 'Career Guides | ApnaInsights'
    },
    {
        // Same marketplace page as 'career-guides' above, but WITHOUT the
        // mentor-redirect guard - this is the "Browse Experts" escape hatch
        // linked from the mentor dashboard, so a mentor can still see the
        // public listing on request without it becoming their default landing page.
        path: 'career-guides/explore',
        loadComponent: () => import('./features/career-guides/pages/guide-list/guide-list').then(m => m.GuideList),
        title: 'Explore Experts | ApnaInsights'
    },
    {
        path: 'career-guides/dashboard',
        loadComponent: () => import('./features/career-guides/pages/mentor-dashboard/mentor-dashboard').then(m => m.MentorDashboard),
        title: 'Mentor Dashboard | ApnaInsights'
    },
    {
        // Must come before 'career-guides/:expertId' below - route order
        // matters, and a dynamic :expertId segment would otherwise swallow
        // this static path first and try to render a profile for the
        // (nonexistent) expert slug "become-an-instructor".
        path: 'career-guides/become-an-instructor',
        loadComponent: () => import('./features/career-guides/pages/become-instructor/become-instructor').then(m => m.BecomeInstructor),
        title: 'Become an Instructor | ApnaInsights'
    },
    {
        path: 'career-guides/:expertId',
        loadComponent: () => import('./features/career-guides/pages/expert-profile/expert-profile').then(m => m.ExpertProfile),
        title: 'Expert Profile | ApnaInsights'
    },
    {
        path: 'auth',
        component: AuthLayout,
        title: 'Sign In | ApnaInsights',
        canActivate: [guestGuard],
        loadChildren: () => import('./features/auth/auth-module').then(m => m.AuthModule),
    },
    {
        path: '',
        component: MainLayout,
        canActivate: [authGuard],
        children: [
            {
                path: 'admin/:id',
                title: 'Dashboard | ApnaInsights',
                canActivate: [adminGuard, roleGuard],
                loadChildren: () => import('./features/admin/admin-module').then(m => m.AdminModule),
                data: { role: 'admin' }
            },
            {
                path: 'user/:id',
                title: 'Profile | ApnaInsights',
                canActivate: [roleGuard],
                loadChildren: () => import('./features/user/user-module').then(m => m.UserModule),
                data: { role: 'user' }
            },
            {
                path: 'super-admin/:id',
                title: 'Super Admin | ApnaInsights',
                canActivate: [superAdminGuard, roleGuard],
                loadChildren: () => import('./features/super-admin/super-admin.module').then(m => m.SuperAdminModule),
                data: { role: 'super_admin' }
            },
            {
                path: 'sponsor/:id',
                title: 'Sponsor Dashboard | ApnaInsights',
                canActivate: [sponsorGuard, roleGuard],
                loadComponent: () => import('./features/sponsor/pages/sponsor-dashboard/sponsor-dashboard').then(m => m.SponsorDashboard),
                data: { role: 'sponsor' }
            }
        ]
    },
    {
        path: '**',
        title: 'Page Not Found | ApnaInsights',
        component: PageNotFound
    }
];