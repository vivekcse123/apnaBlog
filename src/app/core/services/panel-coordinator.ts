import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

// Makes header popovers (notifications, search, profile menu, category
// mega-menu, mobile drawer) mutually exclusive: opening one tells every
// other subscriber to close, no matter which header component it lives in.
@Injectable({ providedIn: 'root' })
export class PanelCoordinator {
  private _active$ = new BehaviorSubject<string | null>(null);
  readonly active$ = this._active$.asObservable();

  open(id: string): void {
    this._active$.next(id);
  }
}
