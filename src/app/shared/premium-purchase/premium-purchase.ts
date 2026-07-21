import { CommonModule, isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy, Component, DestroyRef, PLATFORM_ID,
  computed, effect, inject, input, output, signal
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, of } from 'rxjs';
import { PaymentService } from '../../core/services/payment.service';
import { CouponService, Pricing, WelcomeCoupon } from '../../core/services/coupon.service';

type Step = 1 | 2 | 3 | 4;

@Component({
  selector: 'app-premium-purchase',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  templateUrl: './premium-purchase.html',
  styleUrl: './premium-purchase.css',
})
export class PremiumPurchase {
  private platformId = inject(PLATFORM_ID);
  private paymentService = inject(PaymentService);
  private couponService = inject(CouponService);
  private destroyRef = inject(DestroyRef);

  open = input<boolean>(false);
  closed = output<void>();
  purchased = output<{ premiumExpiresAt: string | null }>();

  step = signal<Step>(1);
  pricing = signal<Pricing | null>(null);
  welcomeCoupon = signal<WelcomeCoupon | null>(null);
  appliedCoupon = signal<{ code: string; discountPercent: number } | null>(null);
  manualCode = signal('');
  manualCodeError = signal('');

  isPurchasing = signal(false);
  purchaseError = signal('');
  premiumExpiresAt = signal<string | null>(null);

  discountAmountRupees = computed(() => {
    const pricing = this.pricing();
    const coupon = this.appliedCoupon();
    if (!pricing || !coupon) return 0;
    return Math.round(pricing.amountRupees * (coupon.discountPercent / 100));
  });
  totalRupees = computed(() => {
    const pricing = this.pricing();
    if (!pricing) return 0;
    return pricing.amountRupees - this.discountAmountRupees();
  });

  constructor() {
    effect(() => {
      if (!this.open() || !isPlatformBrowser(this.platformId)) return;
      // Reset to a clean first step each time the modal is (re)opened.
      this.step.set(1);
      this.purchaseError.set('');
      this.manualCode.set('');
      this.manualCodeError.set('');
      this.premiumExpiresAt.set(null);

      this.couponService.getPricing()
        .pipe(takeUntilDestroyed(this.destroyRef), catchError(() => of(null)))
        .subscribe(res => this.pricing.set(res?.data ?? null));

      this.couponService.getWelcomeCoupon()
        .pipe(takeUntilDestroyed(this.destroyRef), catchError(() => of(null)))
        .subscribe(res => {
          const coupon = res?.data ?? null;
          this.welcomeCoupon.set(coupon);
          // Auto-apply the welcome coupon by default for eligible first-time buyers.
          if (coupon?.eligible && coupon.code && coupon.discountPercent) {
            this.appliedCoupon.set({ code: coupon.code, discountPercent: coupon.discountPercent });
          }
        });
    });
  }

  close(): void {
    if (this.isPurchasing()) return;
    this.closed.emit();
  }

  goToStep(step: Step): void { this.step.set(step); }
  next(): void { this.step.update(s => (s < 4 ? (s + 1) as Step : s)); }
  back(): void { this.step.update(s => (s > 1 ? (s - 1) as Step : s)); }

  removeCoupon(): void { this.appliedCoupon.set(null); }
  applyWelcomeCoupon(): void {
    const coupon = this.welcomeCoupon();
    if (coupon?.eligible && coupon.code && coupon.discountPercent) {
      this.appliedCoupon.set({ code: coupon.code, discountPercent: coupon.discountPercent });
    }
  }

  applyManualCode(): void {
    const code = this.manualCode().trim().toUpperCase();
    this.manualCodeError.set('');
    if (!code) return;
    const welcome = this.welcomeCoupon();
    if (welcome?.eligible && welcome.code === code && welcome.discountPercent) {
      this.appliedCoupon.set({ code: welcome.code, discountPercent: welcome.discountPercent });
      this.manualCode.set('');
    } else {
      this.manualCodeError.set("We don't recognize that coupon code, or it's not valid for your account.");
    }
  }

  confirmPurchase(): void {
    if (this.isPurchasing()) return;
    this.isPurchasing.set(true);
    this.purchaseError.set('');
    this.paymentService.purchasePremium(this.appliedCoupon()?.code)
      .then((result) => {
        this.isPurchasing.set(false);
        this.premiumExpiresAt.set(result.premiumExpiresAt);
        this.step.set(4);
        this.purchased.emit(result);
      })
      .catch((err: Error) => {
        this.isPurchasing.set(false);
        if (err.message !== 'cancelled') this.purchaseError.set(err.message);
      });
  }
}
