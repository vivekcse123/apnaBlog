import {
  ChangeDetectionStrategy, Component, inject, output, signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { PostService } from '../../../post/services/post-service';

const CTA_PRESETS = ['Learn More →', 'Visit Website →', 'Shop Now →', 'Get Started →', 'Download Free →', 'Book a Demo →'];

const CATEGORIES = [
  'Technology', 'Business', 'Health', 'Education',
  'Lifestyle', 'Entertainment', 'Sports', 'Cooking',
];

@Component({
  selector: 'app-create-campaign',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './create-campaign.html',
  styleUrl: './create-campaign.css',
})
export class CreateCampaign {
  private fb          = inject(FormBuilder);
  private postService = inject(PostService);

  close    = output<void>();
  launched = output<void>();

  isSubmitting = signal(false);
  submitted    = signal(false);
  errorMsg     = signal('');

  readonly ctaPresets   = CTA_PRESETS;
  readonly categories   = CATEGORIES;

  form = this.fb.group({
    campaignName:  ['', [Validators.required, Validators.minLength(5), Validators.maxLength(120)]],
    brandName:     ['', [Validators.required, Validators.maxLength(80)]],
    destinationUrl:['', [Validators.required, Validators.pattern(/^https?:\/\/.+/)]],
    ctaText:       ['Learn More →', [Validators.required, Validators.maxLength(50)]],
    category:      ['Technology', Validators.required],
    pitch:         ['', [Validators.required, Validators.minLength(30), Validators.maxLength(280)]],
    notes:         ['', Validators.maxLength(500)],
  });

  setCtaPreset(text: string): void {
    this.form.patchValue({ ctaText: text });
  }

  submit(): void {
    if (this.form.invalid || this.isSubmitting()) return;
    this.isSubmitting.set(true);
    this.errorMsg.set('');

    const v = this.form.value;
    const content = `
<h2>About This Campaign</h2>
<p>${v.pitch}</p>
<p>Visit <strong>${v.brandName}</strong> to learn more about their products and services.</p>
${v.notes ? `<h2>Additional Information</h2><p>${v.notes}</p>` : ''}
`.trim();

    this.postService.createBlog({
      title:          v.campaignName!,
      description:    v.pitch!.slice(0, 280),
      content,
      categories:     [v.category!],
      tags:           [],
      status:         'pending',
      sponsorCtaUrl:  v.destinationUrl ?? null,
      sponsorCtaText: v.ctaText ?? null,
      sponsorBrand:   v.brandName ?? null,
    } as any).subscribe({
      next: () => {
        this.isSubmitting.set(false);
        this.submitted.set(true);
      },
      error: err => {
        this.isSubmitting.set(false);
        this.errorMsg.set(err?.error?.message ?? 'Submission failed. Please try again.');
      },
    });
  }
}
