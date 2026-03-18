import { Directive, ElementRef, Input, Renderer2, OnChanges } from '@angular/core';

@Directive({
  selector: '[appDisabled]'
})
export class DisabledDirective implements OnChanges {

  @Input() appDisabled: boolean = false;

  constructor(private el: ElementRef, private renderer: Renderer2) {}

  ngOnChanges() {
    if (this.appDisabled) {
      this.renderer.setAttribute(this.el.nativeElement, 'disabled', 'true');
      this.renderer.setStyle(this.el.nativeElement, 'opacity', '0.5');
      this.renderer.setStyle(this.el.nativeElement, 'cursor', 'not-allowed');
    } else {
      this.renderer.removeAttribute(this.el.nativeElement, 'disabled');
      this.renderer.removeStyle(this.el.nativeElement, 'opacity');
      this.renderer.removeStyle(this.el.nativeElement, 'cursor');
    }
  }

}