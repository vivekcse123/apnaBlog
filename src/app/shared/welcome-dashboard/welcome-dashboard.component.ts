import { CommonModule } from '@angular/common';
import { Component, Input, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterOutlet } from '@angular/router';
import { LoginComponent } from '../../auth/login/login.component';
import { SignUpComponent } from '../../auth/sign-up/sign-up.component';
import { AuthService } from '../../services/auth.service';

@Component({
    selector: 'app-dashboard',
    imports: [FormsModule, CommonModule, LoginComponent, SignUpComponent],
    templateUrl: './welcome-dashboard.component.html',
    styleUrls: ['./welcome-dashboard.component.css']
})
export class WelcomeDashboardComponent implements OnInit{

  constructor(private router: Router, private auth: AuthService) {}
  isTrue: any;
  ngOnInit(): void {
    this.auth.accountStatus$.subscribe((res) =>{
      this.isTrue = res;
    });
  }

  startWriting(): void {
    
  }

  seeBlogs(): void {
    this.router.navigate(['/blogs']);
  }

  checkFestivals(): void {
    this.router.navigate(['/festival-feed']);
  }


}