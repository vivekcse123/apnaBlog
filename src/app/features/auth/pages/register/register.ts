import { Component, inject, OnInit, signal } from '@angular/core';
import { AdminRoutingModule } from "../../../admin/admin-routing-module";
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { FormBuilder, FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { Auth } from '../../../../core/services/auth';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule, ReactiveFormsModule],
  templateUrl: './register.html',
  styleUrl: './register.css',
})
export class Register implements OnInit{
  private fb = inject(FormBuilder);
  private authService = inject(Auth);
  private router = inject(Router);

  registerForm: FormGroup = new FormGroup({});

  ngOnInit(): void {
    this.registerForm = this.fb.group({
      name: new FormControl('', [Validators.required, Validators.pattern(/^[a-zA-Z ]+$/), Validators.minLength(5), Validators.maxLength(15)]),
      email: new FormControl('', [Validators.required, Validators.pattern(/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/)]),
      dob: new FormControl('', [Validators.required]),
      password: new FormControl('', [Validators.required, Validators.minLength(5), Validators.maxLength(15)]),
      role: new FormControl('User'),
    });

  }

  isSubmitted = signal(false);
  errorMessage = signal('');
  successMessage = signal('');

  register(){
    this.isSubmitted.set(true);

    if(this.registerForm.invalid){
      this.registerForm.markAsTouched();
      return;
    }

    this.authService.register(this.registerForm.value).subscribe({
      next: (res) =>{
        this.successMessage.set("User registered successfully...!");
        this.errorMessage.set('');
        setTimeout(() =>{
          this.router.navigate(['/auth/login']);
        }, 1000);
      },
      error: (err) =>{
        this.successMessage.set('');
        this.errorMessage.set(err?.error?.message);
      }
    })
  }
}
