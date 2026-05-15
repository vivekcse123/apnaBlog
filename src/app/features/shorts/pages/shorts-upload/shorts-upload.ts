import {
  Component, inject, signal, output, PLATFORM_ID,
} from '@angular/core';
import { isPlatformBrowser, CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ShortsService, CreateShortPayload } from '../../services/shorts.service';
import { UploadService } from '../../../../features/post/services/upload-service';
import { Auth } from '../../../../core/services/auth';
import { VideoShort } from '../../models/video-short.model';

type Step = 'source' | 'form';
type Source = 'youtube' | 'upload';

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
  private auth          = inject(Auth);
  private platformId    = inject(PLATFORM_ID);

  close   = output<void>();
  created = output<VideoShort>();

  step         = signal<Step>('source');
  source       = signal<Source | null>(null);
  isSubmitting = signal(false);
  isUploading  = signal(false);
  errorMsg     = signal('');

  // YouTube flow
  ytUrl        = signal('');
  ytId         = signal<string | null>(null);
  ytError      = signal('');

  // File upload flow
  videoFile    = signal<File | null>(null);
  videoPreview = signal('');
  uploadedUrl  = signal('');
  thumbUrl     = signal('');

  readonly CATEGORIES = [
    'News', 'Sports', 'Technology', 'Entertainment',
    'Lifestyle', 'Health', 'Business', 'Education',
  ];

  form = this.fb.group({
    title:    ['', [Validators.required, Validators.minLength(3), Validators.maxLength(80)]],
    caption:  ['', Validators.maxLength(150)],
    category: ['', Validators.required],
  });

  // ── Step 1: choose source ──────────────────────────────────────────────────

  selectSource(s: Source): void {
    this.source.set(s);
    this.step.set('source'); // stay on source until valid
    this.errorMsg.set('');
    this.ytError.set('');
  }

  // ── YouTube URL validation ─────────────────────────────────────────────────

  validateYtUrl(): void {
    const url = this.ytUrl().trim();
    if (!url) { this.ytError.set(''); this.ytId.set(null); return; }
    const id = this.service.extractYouTubeId(url);
    if (!id) {
      this.ytError.set('Paste a valid YouTube or YouTube Shorts URL.');
      this.ytId.set(null);
    } else {
      this.ytError.set('');
      this.ytId.set(id);
    }
  }

  proceedWithYt(): void {
    this.validateYtUrl();
    if (!this.ytId()) return;
    this.step.set('form');
  }

  // ── Video file upload ─────────────────────────────────────────────────────

  onVideoFile(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;

    const allowed = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo'];
    if (!allowed.includes(file.type)) {
      this.errorMsg.set('Use MP4, WebM, MOV or AVI under 50 MB.');
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      this.errorMsg.set('Video must be under 50 MB.');
      return;
    }
    this.errorMsg.set('');
    this.videoFile.set(file);

    if (isPlatformBrowser(this.platformId)) {
      this.videoPreview.set(URL.createObjectURL(file));
    }
    this.uploadToCloudinary(file);
  }

  private uploadToCloudinary(file: File): void {
    this.isUploading.set(true);
    this.uploadService.uploadVideo(file).subscribe({
      next: res => {
        this.isUploading.set(false);
        if (res.success && res.url) {
          this.uploadedUrl.set(res.url);
          this.thumbUrl.set(res.url.replace(/\.[^.]+$/, '.jpg')); // Cloudinary auto-thumb
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

  // ── Final submit ──────────────────────────────────────────────────────────

  submit(): void {
    if (this.form.invalid || this.isSubmitting()) return;

    const { title, caption, category } = this.form.value;
    const src = this.source();
    if (!src) return;

    let payload: CreateShortPayload;

    if (src === 'youtube') {
      const youtubeId = this.ytId()!;
      payload = {
        title: title!,
        caption: caption ?? undefined,
        category: category!,
        videoType: 'youtube',
        videoUrl: `https://www.youtube.com/watch?v=${youtubeId}`,
        youtubeId,
        thumbnailUrl: this.service.youtubeThumbnail(youtubeId),
      };
    } else {
      if (!this.uploadedUrl()) { this.errorMsg.set('Video not yet uploaded.'); return; }
      payload = {
        title: title!,
        caption: caption ?? undefined,
        category: category!,
        videoType: 'upload',
        videoUrl: this.uploadedUrl(),
        thumbnailUrl: this.thumbUrl() || undefined,
      };
    }

    this.isSubmitting.set(true);
    this.errorMsg.set('');

    this.service.createShort(payload).subscribe({
      next: res => {
        this.isSubmitting.set(false);
        this.created.emit(res.data);
      },
      error: err => {
        this.isSubmitting.set(false);
        this.errorMsg.set(err?.error?.message ?? 'Something went wrong. Try again.');
      },
    });
  }

  back(): void {
    if (this.step() === 'form') {
      this.step.set('source');
      this.errorMsg.set('');
    } else {
      this.close.emit();
    }
  }
}
