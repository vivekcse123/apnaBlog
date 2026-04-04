import { Injectable, signal } from '@angular/core';

type LoaderSize = 'sm' | 'md' | 'lg';
type LoaderType = 'overlay' | 'skeleton';

@Injectable({ providedIn: 'root' })
export class LoaderService {
  loading       = signal(false);
  size          = signal<LoaderSize>('md');
  type          = signal<LoaderType>('overlay');
  skeletonCount = signal(4);

  show(type: LoaderType = 'overlay', size: LoaderSize = 'md', skeletonCount = 4): void {
    this.type.set(type);
    this.size.set(size);
    this.skeletonCount.set(skeletonCount);
    this.loading.set(true);
  }

  hide(): void {
    this.loading.set(false);
  }
}