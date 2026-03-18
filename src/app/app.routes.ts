import { Routes } from '@angular/router';
import { AuthLayout } from './layouts/auth-layout/auth-layout';
import { MainLayout } from './layouts/main-layout/main-layout';
import { PageNotFound } from './shared/page-not-found/page-not-found';

export const routes: Routes = [
    {
        path: '',
        redirectTo: 'welcome',
        pathMatch: 'full',
    },
    {
        path: 'welcome',
        loadChildren: () => import('./features/landing/landing-module').then(m => m.LandingModule)
    },
    {
        path: 'auth',
        component: AuthLayout,
        loadChildren: () => import('./features/auth/auth-module').then(m => m.AuthModule)
    },
    {
        path: '',
        component: MainLayout,
        children: [
            {
                path: 'user',
                loadChildren: () => import('./features/user/user-module').then(m => m.UserModule)
            },
            {
                path: 'admin',
                loadChildren: () => import('./features/admin/admin-module').then(m => m.AdminModule)
            }
        ]
    },
    {
        path: '**',
        component: PageNotFound
    }
];