import {
  Component, inject, signal, output, PLATFORM_ID, ViewChild, ElementRef,
} from '@angular/core';
import { isPlatformBrowser, CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ShortsService, CreateShortPayload } from '../../services/shorts.service';
import { UploadService } from '../../../../features/post/services/upload-service';
import { VideoShort } from '../../models/video-short.model';
import { Auth } from '../../../../core/services/auth';

type Step = 'pick' | 'trim' | 'form' | 'review';

@Component({
  selector: 'app-shorts-upload',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './shorts-upload.html',
  styleUrl: './shorts-upload.css',
})
export class ShortsUpload {
  private fb            = inject(FormBuilder);
  private service       = inject(ShortsService);
  private uploadService = inject(UploadService);
  private platformId    = inject(PLATFORM_ID);
  private auth          = inject(Auth);

  get isSponsor(): boolean { return this.auth.isSponsor(); }

  @ViewChild('trimVideoEl') trimVideoRef?: ElementRef<HTMLVideoElement>;

  close   = output<void>();
  created = output<VideoShort>();

  step         = signal<Step>('pick');
  isSubmitting = signal(false);
  isUploading  = signal(false);
  errorMsg     = signal('');

  // File upload flow
  videoFile        = signal<File | null>(null);
  videoPreview     = signal('');
  uploadedUrl      = signal('');
  thumbUrl         = signal('');
  uploadedDuration = signal<number | null>(null);

  // Trim step
  rawDuration = signal(0);
  trimStart   = signal(0);

  readonly CATEGORIES = [
    'News', 'Sports', 'Technology', 'Entertainment',
    'Lifestyle', 'Health', 'Business', 'Education',
    'Finance', 'Travel', 'Food', 'Fashion',
    'Fitness', 'Gaming', 'Comedy', 'Motivation',
    'Politics', 'Science', 'Art', 'Music',
  ];

  form = this.fb.group({
    title:                 ['', [Validators.required, Validators.minLength(3), Validators.maxLength(80)]],
    caption:               ['', Validators.maxLength(150)],
    category:              ['', Validators.required],
    isSponsored:           [false],
    sponsoredDays:         [7],
    sponsoredExpiryAction: ['keep'],
  });

  readonly SPONSORED_DURATION_OPTIONS = [
    { label: '1 day',    value: 1  },
    { label: '3 days',   value: 3  },
    { label: '1 week',   value: 7  },
    { label: '2 weeks',  value: 14 },
    { label: '1 month',  value: 30 },
    { label: 'No expiry',value: 0  },
  ];

  readonly MAX_DURATION_SEC = 60;

  // ── File pick ─────────────────────────────────────────────────────────────

  onVideoFile(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;

    const allowed = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo'];
    if (!allowed.includes(file.type)) {
      this.errorMsg.set('Use MP4, WebM, MOV or AVI.');
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      this.errorMsg.set('Video must be under 50 MB.');
      return;
    }

    if (!isPlatformBrowser(this.platformId)) {
      this.videoFile.set(file);
      this.videoPreview.set('');
      this.uploadToCloudinary(file, 0);
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    const probe = document.createElement('video');
    probe.preload = 'metadata';
    probe.src = objectUrl;

    probe.onloadedmetadata = () => {
      const dur = probe.duration;
      URL.revokeObjectURL(objectUrl);
      this.errorMsg.set('');
      this.videoFile.set(file);
      this.rawDuration.set(dur);
      this.trimStart.set(0);
      this.videoPreview.set(URL.createObjectURL(file));

      if (dur > this.MAX_DURATION_SEC) {
        this.step.set('trim');
      } else {
        this.uploadToCloudinary(file, 0);
      }
    };

    probe.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      this.errorMsg.set('');
      this.videoFile.set(file);
      this.videoPreview.set(URL.createObjectURL(file));
      this.uploadToCloudinary(file, 0);
    };
  }

  // ── Trim step ─────────────────────────────────────────────────────────────

  get trimMax(): number { return Math.max(0, this.rawDuration() - this.MAX_DURATION_SEC); }
  get trimEnd(): number { return Math.min(this.trimStart() + this.MAX_DURATION_SEC, this.rawDuration()); }

  onTrimSlider(event: Event): void {
    const val = parseFloat((event.target as HTMLInputElement).value);
    this.trimStart.set(val);
    const vid = this.trimVideoRef?.nativeElement;
    if (vid) vid.currentTime = val;
  }

  confirmTrim(): void {
    const file = this.videoFile();
    if (!file) return;
    this.uploadToCloudinary(file, this.trimStart());
  }

  fmtSec(s: number): string {
    const m = Math.floor(s / 60);
    return `${m}:${Math.floor(s % 60).toString().padStart(2, '0')}`;
  }

  private uploadToCloudinary(file: File, startTime: number): void {
    this.isUploading.set(true);
    this.uploadService.uploadVideo(file, startTime).subscribe({
      next: res => {
        this.isUploading.set(false);
        if (res.success && res.url) {
          this.uploadedUrl.set(res.url);
          this.thumbUrl.set(res.thumbnailUrl ?? res.url.replace(/\.[^.]+$/, '.jpg'));
          this.uploadedDuration.set(res.duration ?? null);
          this.step.set('form');
        } else {
          this.errorMsg.set(res.message ?? 'Upload failed. Try again.');
        }
      },
      error: err => {
        this.isUploading.set(false);
        this.errorMsg.set(err?.error?.message ?? 'Upload failed. Try again.');
      },
    });
  }

  // ── Submit ────────────────────────────────────────────────────────────────

  submit(): void {
    if (this.form.invalid || this.isSubmitting()) return;
    if (!this.uploadedUrl()) { this.errorMsg.set('Video not yet uploaded.'); return; }

    const { title, caption, category, isSponsored, sponsoredDays, sponsoredExpiryAction } = this.form.value;

    const payload: CreateShortPayload = {
      title:                 title!,
      caption:               caption ?? undefined,
      category:              category!,
      videoType:             'upload',
      videoUrl:              this.uploadedUrl(),
      thumbnailUrl:          this.thumbUrl() || undefined,
      duration:              this.uploadedDuration() ?? undefined,
      isSponsored:           !!isSponsored,
      sponsoredDays:         isSponsored ? (sponsoredDays ?? 7)           : undefined,
      sponsoredExpiryAction: isSponsored ? (sponsoredExpiryAction as any) : undefined,
    };

    this.isSubmitting.set(true);
    this.errorMsg.set('');

    this.service.createShort(payload).subscribe({
      next: res => {
        this.isSubmitting.set(false);
        if (this.isSponsor) {
          this.step.set('review');
        } else {
          this.created.emit(res.data);
        }
      },
      error: err => {
        this.isSubmitting.set(false);
        this.errorMsg.set(err?.error?.message ?? 'Something went wrong. Try again.');
      },
    });
  }

  back(): void {
    const s = this.step();
    if (s === 'review') {
      this.close.emit();
    } else if (s === 'form' || s === 'trim') {
      this.step.set('pick');
      this.videoFile.set(null);
      this.videoPreview.set('');
      this.uploadedUrl.set('');
      this.errorMsg.set('');
    } else {
      this.close.emit();
    }
  }
}
