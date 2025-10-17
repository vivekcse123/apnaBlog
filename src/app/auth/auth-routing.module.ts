import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { LoginComponent } from './login/login.component';
import { SignUpComponent } from './sign-up/sign-up.component';
import { VerifyUser } from './verify-user/verify-user';
import { ForgotPassword } from './forgot-password/forgot-password';

const routes: Routes = [
  { path: 'verify-user', component: VerifyUser },
  { path: 'forgot-password', component: ForgotPassword }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class AuthRoutingModule { }
