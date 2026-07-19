import { Injectable, signal } from '@angular/core';

type LoaderSize = 'sm' | 'md' | 'lg';
type LoaderType = 'overlay' | 'skeleton';

@Injectable({ providedIn: 'root' })
export class LoaderService {
  loading       = signal(false);
  size          = signal<LoaderSize>('md');
  type          = signal<LoaderType>('overlay');
  skeletonCount = signal(4);

  private _count = 0;
  private _watchdog: ReturnType<typeof setTimeout> | null = null;
  // No legitimate navigation/request should stay in flight this long - this
  // is a last-resort self-heal in case a show() is ever left unpaired (e.g.
  // a swallowed router event), so the overlay can never get stuck forever.
  private static readonly WATCHDOG_MS = 8000;

  show(type: LoaderType = 'overlay', size: LoaderSize = 'md', skeletonCount = 4): void {
    this._count++;
    this.type.set(type);
    this.size.set(size);
    this.skeletonCount.set(skeletonCount);
    this.loading.set(true);
    if (this._watchdog) clearTimeout(this._watchdog);
    this._watchdog = setTimeout(() => this.forceHide(), LoaderService.WATCHDOG_MS);
  }

  hide(): void {
    this._count = Math.max(0, this._count - 1);
    if (this._count === 0) this._clear();
  }

  /** Force-hide regardless of in-flight count - use on component destroy. */
  forceHide(): void {
    this._count = 0;
    this._clear();
  }

  private _clear(): void {
    this.loading.set(false);
    if (this._watchdog) { clearTimeout(this._watchdog); this._watchdog = null; }
  }
}