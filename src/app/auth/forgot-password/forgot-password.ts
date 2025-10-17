import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';

@Component({
  selector: 'app-forgot-password',
  imports: [FormsModule, ReactiveFormsModule, CommonModule],
  templateUrl: './forgot-password.html',
  styleUrl: './forgot-password.css'
})
export class ForgotPassword {
  forgotPasswordForm: FormGroup = new FormGroup({});
  constructor(private fb: FormBuilder){
    this.forgotPasswordForm = this.fb.group({
      'new_password' : new FormControl('', [Validators.required, Validators.minLength(5), Validators.maxLength(10)]),
      'confirm_password': new FormControl('', [Validators.required])
    });
  }

  forgotPassword(){
    
  }
}
