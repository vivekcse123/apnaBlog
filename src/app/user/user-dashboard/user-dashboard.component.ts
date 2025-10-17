import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

@Component({
    selector: 'app-user-dashboard',
    imports: [RouterOutlet, RouterLink, CommonModule, RouterLinkActive],
    templateUrl: './user-dashboard.component.html',
    styleUrl: './user-dashboard.component.css'
})
export class UserDashboardComponent {
  constructor(private router: Router){}
  
  logout(){
    this.router.navigate(['welcome-dashboard'])
  }
}
