import { Routes } from '@angular/router';
import { AuthLayout } from './layouts/auth-layout/auth-layout';
import { MainLayout } from './layouts/main-layout/main-layout';
import { PageNotFound } from './shared/page-not-found/page-not-found';
import { authGuard, guestGuard } from './core/guards/auth-guard';
import { adminGuard } from './core/guards/admin-guard';
import { superAdminGuard } from './core/guards/super-admin-guard';
import { roleGuard } from './core/guards/role-guard';

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
        path: 'category/:category',
        loadComponent: () => import('./features/landing/pages/category-page/category-page').then(m => m.CategoryPage),
        title: 'Category | ApnaInsights'
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
            }
        ]
    },
    {
        path: '**',
        title: 'Page Not Found | ApnaInsights',
        component: PageNotFound
    }
];