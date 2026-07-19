import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface CreateOrderData {
  orderId:  string;
  amount:   number;
  currency: string;
  keyId:    string;
  name:     string;
  email:    string;
}

interface RazorpaySuccessResponse {
  razorpay_order_id:   string;
  razorpay_payment_id: string;
  razorpay_signature:  string;
}

declare global {
  interface Window { Razorpay: new (options: Record<string, unknown>) => RazorpayCheckout; }
}

interface RazorpayCheckout {
  open(): void;
  on(event: 'payment.failed', handler: (response: { error?: { description?: string } }) => void): void;
}

const CHECKOUT_SCRIPT_SRC = 'https://checkout.razorpay.com/v1/checkout.js';

@Injectable({ providedIn: 'root' })
export class PaymentService {
  private http        = inject(HttpClient);
  private platformId  = inject(PLATFORM_ID);
  private endpoint    = `${environment.apiUrl}/payment`;
  private scriptReady: Promise<void> | null = null;

  private loadCheckoutScript(): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return Promise.resolve();
    if (window.Razorpay) return Promise.resolve();
    if (this.scriptReady) return this.scriptReady;

    this.scriptReady = new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = CHECKOUT_SCRIPT_SRC;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Could not load the payment checkout. Check your connection and try again.'));
      document.body.appendChild(script);
    });
    return this.scriptReady;
  }

  /**
   * Opens Razorpay Checkout for the one-time Premium purchase and resolves
   * once the server has verified the payment signature and granted
   * isPremium. Rejects on cancellation, checkout failure, or a failed
   * server-side verification - callers should catch and show that message.
   */
  async purchasePremium(): Promise<void> {
    await this.loadCheckoutScript();

    const res = await firstValueFrom(
      this.http.post<{ status: number; data: CreateOrderData }>(`${this.endpoint}/create-order`, {})
    );
    const order = res.data;

    return new Promise<void>((resolve, reject) => {
      const rzp = new window.Razorpay({
        key: order.keyId,
        amount: order.amount,
        currency: order.currency,
        name: 'ApnaInsights',
        description: 'Premium — Unlimited Mentor Sessions',
        order_id: order.orderId,
        prefill: { name: order.name, email: order.email },
        theme: { color: '#2563EB' },
        handler: (response: RazorpaySuccessResponse) => {
          this.http.post<{ status: number; message: string; data: { isPremium: boolean } }>(
            `${this.endpoint}/verify`,
            response
          ).subscribe({
            next: () => resolve(),
            error: (err) => reject(new Error(err?.error?.message ?? 'Payment could not be verified. Please contact support.')),
          });
        },
        modal: {
          ondismiss: () => reject(new Error('cancelled')),
        },
      });
      rzp.on('payment.failed', (resp) => reject(new Error(resp.error?.description || 'Payment failed.')));
      rzp.open();
    });
  }
}
