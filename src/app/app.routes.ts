import { Routes } from '@angular/router';
import { AuthLayout } from './layouts/auth-layout/auth-layout';
import { MainLayout } from './layouts/main-layout/main-layout';
import { PageNotFound } from './shared/page-not-found/page-not-found';
import { authGuard, guestGuard } from './core/guards/auth-guard';
import { adminGuard } from './core/guards/admin-guard';
import { roleGuard } from './core/guards/role-guard';

export const routes: Routes = [
    {
        path: '',
        redirectTo: 'welcome',
        pathMatch: 'full',
    },
    {
        path: 'welcome',
        loadChildren: () => import('./features/landing/landing-module').then(m => m.LandingModule),
        title: 'ApnaBlog | About'
    },

    {
        path: 'auth',
        component: AuthLayout,
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
                canActivate: [adminGuard, roleGuard],
                loadChildren: () => import('./features/admin/admin-module').then(m => m.AdminModule),
                data: {role: 'admin'}
            },
            {
                path: 'user/:id',
                loadChildren: () => import('./features/user/user-module').then(m => m.UserModule),
                data: {role: 'user'}
            }
        ]
    },

    {
        path: '**',
        component: PageNotFound
    }
];