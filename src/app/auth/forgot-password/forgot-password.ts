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
  isSubmited: boolean = false;

  forgotPassword() {
    this.isSubmited = true;
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
  
  
  togglePassword(field: string) {
  const input = document.getElementById(field) as HTMLInputElement;
  const icon = field === 'new_password' ? document.getElementById('toggleNewPassword') : document.getElementById('toggleConfirmPassword');

  if (input.type === 'password') {
    input.type = 'text';
    icon?.classList.remove('bi-eye-fill');
    icon?.classList.add('bi-eye-slash-fill');
  } else {
    input.type = 'password';
    icon?.classList.remove('bi-eye-slash-fill');
    icon?.classList.add('bi-eye-fill');
  }
}

}
