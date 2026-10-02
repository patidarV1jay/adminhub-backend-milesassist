import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { MetricsService } from './metrics.service';

@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  constructor(private readonly metrics: MetricsService) {}

  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const start = performance.now();
    return next.handle().pipe(finalize(() => this.metrics.record(performance.now() - start)));
  }
}
