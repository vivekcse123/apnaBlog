import {
  ChangeDetectionStrategy, Component, ElementRef, NgZone, PLATFORM_ID, ViewChild, computed, inject, output, signal
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
  changeDetection: ChangeDetectionStrategy.OnPush,
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
  private ngZone        = inject(NgZone);

  @ViewChild('trimVideoEl') trimVideoRef?: ElementRef<HTMLVideoElement>;
  @ViewChild('timelineRef') timelineRef?: ElementRef<HTMLElement>;

  close   = output<void>();
  created = output<VideoShort>();

  step         = signal<Step>('pick');
  isSubmitting = signal(false);
  isUploading  = signal(false);
  errorMsg     = signal('');

  // File & upload state
  videoFile        = signal<File | null>(null);
  videoPreview     = signal('');
  uploadedUrl      = signal('');
  thumbUrl         = signal('');
  uploadedDuration = signal<number | null>(null);
  uploadPercent    = signal(0);
  isProcessing     = signal(false);

  // Trim state
  rawDuration        = signal(0);
  trimStart          = signal(0);
  trimEnd            = signal(0);
  currentTime        = signal(0);
  isPlaying          = signal(false);
  frameUrls          = signal<string[]>([]);
  isGeneratingFrames = signal(false);
  activeDragSide     = signal<'left' | 'right' | null>(null);

  // Derived values for the template — avoid inline math
  readonly startPct    = computed(() => this.rawDuration() > 0 ? (this.trimStart()   / this.rawDuration()) * 100 : 0);
  readonly endPct      = computed(() => this.rawDuration() > 0 ? (this.trimEnd()     / this.rawDuration()) * 100 : 100);
  readonly selWidthPct = computed(() => this.endPct() - this.startPct());
  readonly headPct     = computed(() => this.rawDuration() > 0 ? (this.currentTime() / this.rawDuration()) * 100 : 0);
  readonly clipDur     = computed(() => Math.max(0, this.trimEnd() - this.trimStart()));

  get skeletonFrames(): number[] {
    return Array.from({ length: Math.max(0, 12 - this.frameUrls().length) });
  }

  readonly CATEGORIES = [
    'News', 'Sports', 'Technology', 'Entertainment',
    'Lifestyle', 'Health', 'Business', 'Education',
    'Finance', 'Travel', 'Food', 'Fashion',
    'Fitness', 'Gaming', 'Comedy', 'Motivation',
    'Politics', 'Science', 'Art', 'Music',
  ];

  form = this.fb.group({
    title:   ['', [Validators.required, Validators.minLength(3), Validators.maxLength(80)]],
    caption: ['', Validators.maxLength(200)],
    category:['', Validators.required],
  });

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
      const dur = isFinite(probe.duration) && probe.duration > 0 ? probe.duration : 0;
      URL.revokeObjectURL(objectUrl);
      this.errorMsg.set('');
      this.videoFile.set(file);
      this.rawDuration.set(dur);
      this.trimStart.set(0);
      this.trimEnd.set(dur);
      this.currentTime.set(0);
      this.frameUrls.set([]);
      this.videoPreview.set(URL.createObjectURL(file));
      this.step.set('trim');
      setTimeout(() => this.generateFilmstrip(), 80);
    };

    probe.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      this.errorMsg.set('');
      this.videoFile.set(file);
      this.videoPreview.set(URL.createObjectURL(file));
      this.rawDuration.set(0);
      this.trimStart.set(0);
      this.trimEnd.set(0);
      this.step.set('trim');
    };
  }

  // ── Preview playback ───────────────────────────────────────────────────────

  togglePreview(): void {
    const vid = this.trimVideoRef?.nativeElement;
    if (!vid) return;
    if (this.isPlaying()) {
      vid.pause();
      this.isPlaying.set(false);
    } else {
      vid.currentTime = this.trimStart();
      vid.play().catch(() => {});
      this.isPlaying.set(true);
    }
  }

  stopPreview(): void {
    const vid = this.trimVideoRef?.nativeElement;
    if (vid) vid.pause();
    this.isPlaying.set(false);
  }

  onVideoTimeUpdate(): void {
    const vid = this.trimVideoRef?.nativeElement;
    if (!vid) return;
    this.currentTime.set(vid.currentTime);
    if (this.isPlaying() && vid.currentTime >= this.trimEnd()) {
      vid.pause();
      this.isPlaying.set(false);
      vid.currentTime = this.trimStart();
    }
  }

  // ── Drag handles ──────────────────────────────────────────────────────────
  // Uses setPointerCapture so events keep firing on the handle even when the
  // pointer moves outside it — no window listeners needed, no zone tricks.

  private seekRaf: number | null = null;

  private seekTo(time: number): void {
    if (this.seekRaf !== null) cancelAnimationFrame(this.seekRaf);
    this.seekRaf = requestAnimationFrame(() => {
      const vid = this.trimVideoRef?.nativeElement;
      if (vid) vid.currentTime = time;
      this.seekRaf = null;
    });
  }

  startDrag(side: 'left' | 'right', e: PointerEvent): void {
    e.preventDefault();
    e.stopPropagation();
    this.stopPreview();
    this.activeDragSide.set(side);

    const handle = e.currentTarget as HTMLElement;
    handle.setPointerCapture(e.pointerId);

    const onMove = (me: PointerEvent): void => {
      const timeline = this.timelineRef?.nativeElement;
      if (!timeline || this.rawDuration() === 0) return;
      const rect  = timeline.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (me.clientX - rect.left) / rect.width));
      const t     = ratio * this.rawDuration();

      if (side === 'left') {
        const s = Math.max(0, Math.min(t, this.trimEnd() - 0.25));
        this.trimStart.set(s);
        this.currentTime.set(s);
        this.seekTo(s);
      } else {
        const end = Math.max(this.trimStart() + 0.25, Math.min(t, this.rawDuration()));
        this.trimEnd.set(end);
        this.currentTime.set(end);
        this.seekTo(end);
      }
    };

    const onUp = (): void => {
      handle.removeEventListener('pointermove', onMove as EventListener);
      handle.removeEventListener('pointerup',   onUp);
      handle.removeEventListener('pointercancel', onUp);
      this.activeDragSide.set(null);
    };

    handle.addEventListener('pointermove', onMove as EventListener);
    handle.addEventListener('pointerup',   onUp);
    handle.addEventListener('pointercancel', onUp);
  }

  // ── Filmstrip generation ───────────────────────────────────────────────────

  private async generateFilmstrip(): Promise<void> {
    const url = this.videoPreview();
    if (!url || !isPlatformBrowser(this.platformId)) return;

    this.isGeneratingFrames.set(true);

    const video = document.createElement('video');
    video.src     = url;
    video.muted   = true;
    video.preload = 'auto';

    const loaded = await new Promise<boolean>(resolve => {
      video.onloadeddata = () => resolve(true);
      video.onerror      = () => resolve(false);
      video.load();
    });

    if (!loaded || !isFinite(video.duration)) {
      this.isGeneratingFrames.set(false);
      return;
    }

    const canvas = document.createElement('canvas');
    canvas.width  = 48;
    canvas.height = 85;
    const ctx     = canvas.getContext('2d');
    if (!ctx) { this.isGeneratingFrames.set(false); return; }

    const count = 12;
    const dur   = video.duration;
    const frames: string[] = [];

    for (let i = 0; i < count; i++) {
      video.currentTime = (i / (count - 1)) * dur * 0.999;
      await new Promise<void>(resolve => {
        const onSeeked = () => { video.removeEventListener('seeked', onSeeked); resolve(); };
        video.addEventListener('seeked', onSeeked);
      });
      ctx.drawImage(video, 0, 0, 48, 85);
      frames.push(canvas.toDataURL('image/jpeg', 0.65));
      // ngZone.run ensures the signal update is processed even though
      // this async loop runs outside Angular's event handling.
      this.ngZone.run(() => this.frameUrls.set([...frames]));
    }

    video.src = '';
    this.isGeneratingFrames.set(false);
  }

  // ── Confirm & export ───────────────────────────────────────────────────────

  confirmTrim(): void {
    const file = this.videoFile();
    if (!file) return;
    this.stopPreview();

    const start  = this.trimStart();
    const end    = this.trimEnd();
    const rawDur = this.rawDuration();

    // Cloudinary so_/eo_ params: only pass what was actually trimmed.
    // Passing eo_<fullDuration> is a no-op but skipping it keeps the URL clean.
    const effectiveEnd = rawDur > 0 && end < rawDur - 0.1 ? end : undefined;

    this.uploadToCloudinary(file, start, effectiveEnd);
  }

  fmtSec(s: number, tenths = false): string {
    if (!isFinite(s) || s < 0) return '0:00';
    const m   = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    const base = `${m}:${sec.toString().padStart(2, '0')}`;
    return tenths ? `${base}.${Math.floor((s % 1) * 10)}` : base;
  }

  private uploadToCloudinary(file: File, startTime: number, endTime?: number): void {
    this.isUploading.set(true);
    this.uploadPercent.set(0);
    this.isProcessing.set(false);

    this.uploadService.uploadVideoWithProgress(file, startTime, endTime).subscribe({
      next: event => {
        if ('percent' in event) {
          this.uploadPercent.set(event.percent);
          if (event.percent === 100) this.isProcessing.set(true);
        } else {
          this.isUploading.set(false);
          this.isProcessing.set(false);
          if (event.success && event.url) {
            this.uploadedUrl.set(event.url);
            this.thumbUrl.set(event.thumbnailUrl ?? event.url.replace(/\.[^.]+$/, '.jpg'));
            this.uploadedDuration.set(event.duration ?? null);
            this.step.set('form');
          } else {
            this.errorMsg.set(event.message ?? 'Upload failed. Try again.');
          }
        }
      },
      error: err => {
        this.isUploading.set(false);
        this.isProcessing.set(false);
        this.errorMsg.set(err?.error?.message ?? 'Upload failed. Try again.');
      },
    });
  }

  // ── Submit ────────────────────────────────────────────────────────────────

  submit(): void {
    if (this.form.invalid || this.isSubmitting()) return;
    if (!this.uploadedUrl()) { this.errorMsg.set('Video not yet uploaded.'); return; }

    const { title, caption, category } = this.form.value;

    const payload: CreateShortPayload = {
      title:        title!,
      caption:      caption ?? undefined,
      category:     category!,
      videoType:    'upload',
      videoUrl:     this.uploadedUrl(),
      thumbnailUrl: this.thumbUrl() || undefined,
      duration:     this.uploadedDuration() ?? undefined,
    };

    this.isSubmitting.set(true);
    this.errorMsg.set('');

    this.service.createShort(payload).subscribe({
      next: res => {
        this.isSubmitting.set(false);
        if (this.auth.isAdmin()) {
          this.created.emit(res.data);
        } else {
          this.step.set('review');
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
      this.stopPreview();
      this.step.set('pick');
      this.videoFile.set(null);
      this.videoPreview.set('');
      this.uploadedUrl.set('');
      this.frameUrls.set([]);
      this.errorMsg.set('');
    } else {
      this.close.emit();
    }
  }
}
