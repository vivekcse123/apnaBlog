import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from '../../services/auth.service';
import { Router } from '@angular/router';

@Component({
  selector: 'app-verify-user',
  imports: [FormsModule, ReactiveFormsModule, CommonModule],
  templateUrl: './verify-user.html',
  styleUrl: './verify-user.css'
})
export class VerifyUser {
  verifyUserForm: FormGroup = new FormGroup({});
  constructor(private fb: FormBuilder, private auth: AuthService, private router: Router){
    this.verifyUserForm = this.fb.group({
      'username': new FormControl('', [Validators.required, Validators.email])
    });
  }

  verifyUser(){
    this.router.navigate(['/auth/forgot-password']);
  }
  back_login(){
    this.router.navigate(['/welcome-dashboard']);
  }

}
