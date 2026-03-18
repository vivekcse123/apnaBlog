import { CommonModule } from '@angular/common';
import { Component, signal } from '@angular/core';
import { AdminRoutingModule } from "./features/admin/admin-routing-module";
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  
}
