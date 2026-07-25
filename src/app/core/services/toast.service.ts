import { Injectable, signal } from '@angular/core';

export interface Toast {
  id: number;
  message: string;
  type: 'success' | 'error' | 'info' | 'warning';
  dismissing: boolean;
}

interface ToastTimer {
  timeoutId: ReturnType<typeof setTimeout>;
  remaining: number;
  startedAt: number;
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  private _id = 0;
  toasts = signal<Toast[]>([]);
  private timers = new Map<number, ToastTimer>();

  show(message: string, type: Toast['type'] = 'success', duration = 3500): void {
    const id = ++this._id;
    this.toasts.update(list => [...list, { id, message, type, dismissing: false }]);
    this.startTimer(id, duration);
  }

  private startTimer(id: number, remaining: number): void {
    const timeoutId = setTimeout(() => this.dismiss(id), remaining);
    this.timers.set(id, { timeoutId, remaining, startedAt: Date.now() });
  }

  /** Pauses auto-dismiss while the toast has hover or keyboard focus. */
  pause(id: number): void {
    const timer = this.timers.get(id);
    if (!timer) return;
    clearTimeout(timer.timeoutId);
    timer.remaining -= Date.now() - timer.startedAt;
  }

  resume(id: number): void {
    const timer = this.timers.get(id);
    if (!timer) return;
    this.startTimer(id, Math.max(timer.remaining, 500));
  }

  dismiss(id: number): void {
    this.timers.get(id) && clearTimeout(this.timers.get(id)!.timeoutId);
    this.timers.delete(id);
    this.toasts.update(list =>
      list.map(t => t.id === id ? { ...t, dismissing: true } : t)
    );
    setTimeout(() => {
      this.toasts.update(list => list.filter(t => t.id !== id));
    }, 400);
  }
}
