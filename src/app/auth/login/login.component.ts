import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { Login } from '../modals/login';

@Component({
    selector: 'app-login',
    imports: [FormsModule, CommonModule, FormsModule, ReactiveFormsModule, RouterLink],
    templateUrl: './login.component.html',
    styleUrl: './login.component.css'
})
export class LoginComponent {
  loginForm: FormGroup = new FormGroup({});

  constructor(private router: Router, private auth: AuthService, private fb: FormBuilder){
    this.loginForm = this.fb.group({
      'username': new FormControl('', [Validators.required]),
      'password': new FormControl('', [Validators.required])
    });
  }
    
    message: string = "";
    isSuccess: boolean = false;

  login(): void {
    if (this.loginForm?.invalid) {
        this.message = 'Invalid username or password!';
        this.isSuccess = false;
        return;
    }
    this.auth.login(this.loginForm.value as Login).subscribe({
      next: (res) => {
        this.isSuccess = true;
        this.message = 'Logged in successfully!';
        console.log('Response:', res);
      },
      error: (err) => {
        this.isSuccess = false;
        this.message = 'Login failed. Please try again.';
        console.error('Error:', err);
        }
      });
    }

  createAccount(){
    this.auth.updateStatus(false);
  }

  togglePasswordVisibility(){
    const passwordInput = document.getElementById('password') as HTMLInputElement;
    const toggleIcon = document.getElementById('togglePassword') as HTMLElement;

    if (passwordInput.type === 'password') {
      passwordInput.type = 'text';
      toggleIcon.classList.remove('bi-eye-slash');
      toggleIcon.classList.add('bi-eye');
    } else {
      passwordInput.type = 'password';
      toggleIcon.classList.remove('bi-eye');
      toggleIcon.classList.add('bi-eye-slash');
    }
  }

}
