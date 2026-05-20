import { Routes } from '@angular/router';
import { AuthLayout } from './layouts/auth-layout/auth-layout';
import { MainLayout } from './layouts/main-layout/main-layout';
import { PageNotFound } from './shared/page-not-found/page-not-found';
import { authGuard, guestGuard } from './core/guards/auth-guard';
import { adminGuard } from './core/guards/admin-guard';
import { superAdminGuard } from './core/guards/super-admin-guard';
import { roleGuard } from './core/guards/role-guard';
import { sponsorGuard } from './core/guards/sponsor-guard';

export const routes: Routes = [
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
        path: 'advertise',
        loadComponent: () => import('./features/landing/pages/advertise/advertise').then(m => m.Advertise),
        title: 'Advertise with Us | ApnaInsights'
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
        path: 'search',
        loadComponent: () => import('./features/landing/pages/search/search').then(m => m.SearchPage),
        title: 'Search Stories | ApnaInsights'
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
        redirectTo: 'about',
        pathMatch: 'full'
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