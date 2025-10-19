import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-forgot-password',
  imports: [FormsModule, ReactiveFormsModule, CommonModule],
  templateUrl: './forgot-password.html',
  styleUrl: './forgot-password.css'
})

export class ForgotPassword {
  forgotPasswordForm: FormGroup = new FormGroup({});
  constructor(private fb: FormBuilder, private router: Router, private auth: AuthService){
    this.forgotPasswordForm = this.fb.group({
      'new_password' : new FormControl('', [Validators.required, Validators.minLength(5), Validators.maxLength(10)]),
      'confirm_password': new FormControl('', [Validators.required])
    });
  }

  message: string = "";
  isSuccess: boolean = false;
  forgotPassword() {
    this.auth.forgotPassword(this.forgotPasswordForm.value).subscribe({
      next: (res) => {
        this.isSuccess = true;
        this.message = "Password changed successfully... Redirecting to login page....!";
        setTimeout(() => {
          this.router.navigate(['welcome-dashboard']);
        }, 2000);
      },
      error: (err) => {
        console.error("Error:", err);
        this.isSuccess = false;
        this.message = "Something went wrong. Please try again.";
        setTimeout(() =>{
          this.message = '';
        }, 2000);
      }
    });
  }  
}
