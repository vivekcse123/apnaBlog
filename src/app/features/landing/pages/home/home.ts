import { Component } from '@angular/core';
import { AdminRoutingModule } from "../../../admin/admin-routing-module";
import { RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-home',
  imports: [RouterLink, CommonModule],
  templateUrl: './home.html',
  styleUrl: './home.css',
})
export class Home {

}
