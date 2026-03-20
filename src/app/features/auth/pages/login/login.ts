import { Component, inject, OnInit, signal } from '@angular/core';
import { AdminRoutingModule } from "../../../admin/admin-routing-module";
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { FormBuilder, FormControl, FormGroup, FormsModule, NgForm, ReactiveFormsModule, Validators } from '@angular/forms';
import { Auth } from '../../../../core/services/auth';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule, ReactiveFormsModule],
  templateUrl: './login.html',
  styleUrl: './login.css',
})
export class Login implements OnInit{
  private fb = inject(FormBuilder);
  private authService = inject(Auth);
  private router = inject(Router);

  loginForm: FormGroup = new FormGroup({});

  ngOnInit(): void {
    this.loginForm = this.fb.group({
      email: new FormControl('', [Validators.required, Validators.pattern(/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/)]),
      password: new FormControl('', [Validators.required]),
      loginAt: new FormControl(Date.now())
    });
  }

  isSubmitted = signal(false);
  errorMessage = signal('');
  successMessage = signal('');

  login(){
    this.isSubmitted.set(true);

    if(this.loginForm.invalid){
      this.loginForm.markAllAsTouched();
      return;
    }

    this.authService.login(this.loginForm.value).subscribe({
      next: (res) =>{
        console.log(res);
        const role = res.data?.role?.toLowerCase();
        const userId = res.data._id;

        if(!userId || !role){
          this.successMessage.set('');
          this.errorMessage.set('Internal server error..!');
          return;
        }

        this.successMessage.set('User loggedin successfully...!');
        this.errorMessage.set('');
        setTimeout(() =>{
          this.router.navigate(['/', role, userId]);
        }, 1000);
      },
      error: (err) =>{
        this.errorMessage.set(err?.error?.message || 'Login failed, Please try again...!');
        this.successMessage.set('');
      }
    })


  }
}
