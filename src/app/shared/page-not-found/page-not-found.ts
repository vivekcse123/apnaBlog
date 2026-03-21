import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-page-not-found',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './page-not-found.html',
  styleUrl: './page-not-found.css',
})
export class PageNotFound {

}
