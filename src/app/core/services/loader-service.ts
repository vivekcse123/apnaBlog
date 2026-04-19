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

  show(type: LoaderType = 'overlay', size: LoaderSize = 'md', skeletonCount = 4): void {
    this._count++;
    this.type.set(type);
    this.size.set(size);
    this.skeletonCount.set(skeletonCount);
    this.loading.set(true);
  }

  hide(): void {
    this._count = Math.max(0, this._count - 1);
    if (this._count === 0) this.loading.set(false);
  }

  /** Force-hide regardless of in-flight count — use on component destroy. */
  forceHide(): void {
    this._count = 0;
    this.loading.set(false);
  }
}