import { CommonModule } from '@angular/common';
import { Component, HostListener, OnInit } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

@Component({
    selector: 'app-user-dashboard',
    imports: [RouterOutlet, RouterLink, CommonModule, RouterLinkActive],
    templateUrl: './user-dashboard.component.html',
    styleUrl: './user-dashboard.component.css'
})
export class UserDashboardComponent implements OnInit{
  constructor(private router: Router){}

  logoutBtn: string = "Logout";
  logout(){
    this.logoutBtn = "Wait logging out...!";
    setTimeout(() =>{
      this.router.navigate(['welcome-dashboard'])
    }, 2000);
  }
  
  isCollapsed = false;
  ngOnInit(): void {
    this.autoCollapseSidebar(); 
  }
  @HostListener('window:resize', ['$event'])
  onResize() {
    this.autoCollapseSidebar();
  }

  toggleSidebar() {
    this.isCollapsed = !this.isCollapsed;
  }

 autoCollapseSidebar() {
  if (typeof window !== 'undefined') {
    this.isCollapsed = window.innerWidth < 992;
  } else {
    // Fallback for environments without window
    this.isCollapsed = false;
  }
}

}
