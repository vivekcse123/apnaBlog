// core/interceptors/logging.interceptor.ts
import { HttpInterceptorFn } from '@angular/common/http';
import { tap } from 'rxjs';

export const loggingInterceptor: HttpInterceptorFn = (req, next) => {
  console.log('═══════════════════════════════════════');
  console.log('🌐 HTTP REQUEST');
  console.log('═══════════════════════════════════════');
  console.log('Method:', req.method);
  console.log('URL:', req.url);
  console.log('Headers:', req.headers);
  console.log('Body:', req.body);
  console.log('═══════════════════════════════════════');

  return next(req).pipe(
    tap({
      next: (event: any) => {
        if (event.type === 4) { // HttpResponse
          console.log('═══════════════════════════════════════');
          console.log('✅ HTTP RESPONSE');
          console.log('═══════════════════════════════════════');
          console.log('Status:', event.status);
          console.log('Body:', event.body);
          console.log('═══════════════════════════════════════');
        }
      },
      error: (error) => {
        console.log('═══════════════════════════════════════');
        console.log('❌ HTTP ERROR');
        console.log('═══════════════════════════════════════');
        console.log('Status:', error.status);
        console.log('Error:', error);
        console.log('═══════════════════════════════════════');
      }
    })
  );
};