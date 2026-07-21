import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface WelcomeCoupon {
  eligible: boolean;
  code?: string;
  discountPercent?: number;
  description?: string;
  expiresAt?: string | null;
}

export interface Pricing {
  amountPaise: number;
  amountRupees: number;
  currency: string;
}

@Injectable({ providedIn: 'root' })
export class CouponService {
  private http = inject(HttpClient);
  private endpoint = `${environment.apiUrl}/payment`;

  /** Real Premium price - never hardcode/guess this on the frontend. */
  getPricing(): Observable<{ status: number; data: Pricing }> {
    return this.http.get<{ status: number; data: Pricing }>(`${this.endpoint}/pricing`);
  }

  /** The first-purchase welcome coupon, if this user is eligible (server-checked). */
  getWelcomeCoupon(): Observable<{ status: number; data: WelcomeCoupon }> {
    return this.http.get<{ status: number; data: WelcomeCoupon }>(`${this.endpoint}/coupon/welcome`);
  }
}
