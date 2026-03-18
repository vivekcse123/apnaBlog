import { Component } from '@angular/core';
import { AdminRoutingModule } from "../../features/admin/admin-routing-module";
import { RouterOutlet } from '@angular/router';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-main-layout',
  standalone: true,
  imports: [AdminRoutingModule, RouterOutlet, CommonModule],
  templateUrl: './main-layout.html',
  styleUrl: './main-layout.css',
})
export class MainLayout {

}
