import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-about',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink
  ],
  templateUrl: './about.html',
  styleUrl: './about.css',
})
export class About {
  currentYear = new Date().getFullYear();

  formSubmitted = false;
  isSubmitting = false;

  contactData = {
    name: '',
    email: '',
    subject: '',
    message: ''
  };

  submitForm() {
    this.isSubmitting = true;
    setTimeout(() => {
      this.isSubmitting = false;
      this.formSubmitted = true;
      this.contactData = { name: '', email: '', subject: '', message: '' };
    }, 1500);
  }

  navMenuOpen = false; // toggle...
}
