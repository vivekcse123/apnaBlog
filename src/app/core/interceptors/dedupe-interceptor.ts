import { HttpInterceptorFn } from '@angular/common/http';
import { Observable } from 'rxjs';
import { finalize, share } from 'rxjs/operators';

const pending = new Map<string, Observable<any>>();

export const dedupeInterceptor: HttpInterceptorFn = (req, next) => {
  if (req.method !== 'GET') return next(req);

  const key = req.urlWithParams;
  const inflight = pending.get(key);
  if (inflight) return inflight;

  const obs = next(req).pipe(
    share(),
    finalize(() => pending.delete(key))
  );
  pending.set(key, obs);
  return obs;
};
