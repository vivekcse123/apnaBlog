import {
  Component, inject, signal, output, PLATFORM_ID, ViewChild, ElementRef,
} from '@angular/core';
import { isPlatformBrowser, CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ShortsService, CreateShortPayload } from '../../services/shorts.service';
import { UploadService } from '../../../../features/post/services/upload-service';
import { Auth } from '../../../../core/services/auth';
import { VideoShort } from '../../models/video-short.model';

type Step = 'source' | 'trim' | 'form';
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

  @ViewChild('trimVideoEl') trimVideoRef?: ElementRef<HTMLVideoElement>;

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

  readonly MAX_DURATION_SEC = 30;

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
      const preview = URL.createObjectURL(file);
      this.videoPreview.set(preview);

      if (dur > this.MAX_DURATION_SEC) {
        // Video too long — show trimmer
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

  get trimMax(): number {
    return Math.max(0, this.rawDuration() - this.MAX_DURATION_SEC);
  }

  get trimEnd(): number {
    return Math.min(this.trimStart() + this.MAX_DURATION_SEC, this.rawDuration());
  }

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
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
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
        duration: this.uploadedDuration() ?? undefined,
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
    const s = this.step();
    if (s === 'form' || s === 'trim') {
      this.step.set('source');
      this.videoFile.set(null);
      this.videoPreview.set('');
      this.uploadedUrl.set('');
      this.errorMsg.set('');
    } else {
      this.close.emit();
    }
  }
}
