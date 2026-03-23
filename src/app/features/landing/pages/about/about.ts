import { CommonModule } from '@angular/common';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ContactService } from '../../../../core/services/contact-service';

@Component({
  selector: 'app-about',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './about.html',
  styleUrl: './about.css',
})
export class About {
  private contactService = inject(ContactService);
  private destroyRef = inject(DestroyRef);

  currentYear = new Date().getFullYear();
  isSubmitting = signal(false);
  successMessage = signal('');
  errorMessage = signal('');
  formSubmitted = false;

  contactData = { name: '', email: '', subject: '', message: '' };

  submitForm() {
    if (!this.contactData.name || !this.contactData.email ||
        !this.contactData.subject || !this.contactData.message) return;

    this.isSubmitting.set(true);
    this.successMessage.set('');
    this.errorMessage.set('');

    this.contactService.sendMessage(this.contactData)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.isSubmitting.set(false);
          this.formSubmitted = true;
          this.successMessage.set('Message sent successfully! We will get back to you soon.');
          this.contactData = { name: '', email: '', subject: '', message: '' };
        },
        error: (err) => {
          this.isSubmitting.set(false);
          this.errorMessage.set(err?.error?.message ?? 'Something went wrong. Please try again.');
        }
      });
  }

  navMenuOpen = false;

  scrollToContact() {
    document.getElementById('contact')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  scrollTo(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}