import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-loader',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './loader.html',
  styleUrl: './loader.css'
})
export class Loader {
  @Input() loading = false;
  @Input() size: 'sm' | 'md' | 'lg' = 'md';
  @Input() type: 'overlay' | 'skeleton' = 'overlay';
  @Input() skeletonCount = 4; 

  get skeletonItems(): number[] {
    return Array.from({ length: this.skeletonCount }, (_, i) => i);
  }
}