import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, FormsModule, NgForm, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from '../../services/auth.service';
import { SignUp } from '../modals/signup';

@Component({
    selector: 'app-sign-up',
    imports: [FormsModule, CommonModule, ReactiveFormsModule],
    templateUrl: './sign-up.component.html',
    styleUrls: ['./sign-up.component.css']
})
export class SignUpComponent {
  signUpForm: FormGroup = new FormGroup({});
  constructor(private fb: FormBuilder, private auth: AuthService) {
    this.signUpForm = this.fb.group({
      'name': new FormControl('', [Validators.required, Validators.pattern('^[A-Za-z ]+$')]),
      'email': new FormControl('', [Validators.required, Validators.email]),
      'password': new FormControl('', [Validators.required, Validators.minLength(5), Validators.maxLength(10)]),
      'confirm_password': new FormControl('', [Validators.required])
    });
  }

  message: string = "";
  isSuccess: boolean = false;
  isSubmitted: boolean = false;
  signUp(): void {
    this.isSubmitted = true;
    if (this.signUpForm?.invalid) {
      this.message = 'Invalid input data...!';
      this.isSuccess = false;
      return;
    }
    this.auth.signUp(this.signUpForm.value as SignUp).subscribe({
      next: (res) => {
        this.isSuccess = true;
        this.message = 'SignUp successfully!';
        console.log('Response:', res);
      },
      error: (err) => {
        this.isSuccess = false;
        this.message = 'SignUp failed. Please try again.';
        console.error('Error:', err);
      }
    });
  }    

  isSignUp = true;
  toggleAuth() {
    this.isSignUp = !this.isSignUp;
  }

togglePassword(field: string) {

  const input = document.getElementById(field) as HTMLInputElement;

  const icon = field === 'password' 
    ? document.getElementById('togglePassword') 
    : document.getElementById('toggleConfirmPassword');

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
