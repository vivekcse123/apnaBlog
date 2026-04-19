import { Injectable, signal } from '@angular/core';

export interface Toast {
  id: number;
  message: string;
  type: 'success' | 'error' | 'info' | 'warning';
  dismissing: boolean;
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  private _id = 0;
  toasts = signal<Toast[]>([]);

  show(message: string, type: Toast['type'] = 'success', duration = 3500): void {
    const id = ++this._id;
    this.toasts.update(list => [...list, { id, message, type, dismissing: false }]);
    setTimeout(() => this.dismiss(id), duration);
  }

  dismiss(id: number): void {
    this.toasts.update(list =>
      list.map(t => t.id === id ? { ...t, dismissing: true } : t)
    );
    setTimeout(() => {
      this.toasts.update(list => list.filter(t => t.id !== id));
    }, 400);
  }
}
