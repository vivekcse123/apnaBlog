import { CommonModule } from '@angular/common';
import { Component, DestroyRef, inject, signal, OnInit } from '@angular/core'; // ✅ added OnInit
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { RouterLink, Router, NavigationEnd } from '@angular/router'; // ✅ added Router, NavigationEnd
import { filter } from 'rxjs/operators'; // ✅ added filter

import { ContactService } from '../../../../core/services/contact-service';
import { VisitorService } from '../../../../core/services/visitor';

@Component({
  selector: 'app-about',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './about.html',
  styleUrl: './about.css',
})
export class About implements OnInit { // ✅ added OnInit

  private contactService = inject(ContactService);
  private destroyRef = inject(DestroyRef);

  private router = inject(Router); // ✅ added
  private visitorService = inject(VisitorService); // ✅ added

  currentYear = new Date().getFullYear();
  isSubmitting = signal(false);
  successMessage = signal('');
  errorMessage = signal('');
  formSubmitted = false;

  contactData = { name: '', email: '', subject: '', message: '' };

  // ✅ TRACKING LOGIC
  ngOnInit(): void {

    // Track initial page load
    this.visitorService.trackVisit(window.location.pathname);

    // Track route changes
    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(event => {
        this.visitorService.trackVisit(event.urlAfterRedirects);
      });
  }

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