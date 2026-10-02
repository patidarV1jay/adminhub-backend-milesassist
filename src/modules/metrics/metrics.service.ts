import { Injectable } from '@nestjs/common';
import { freemem, totalmem } from 'node:os';

@Injectable()
export class MetricsService {
  private static readonly MAX_SAMPLES = 1000;
  private readonly samples: number[] = [];

  record(durationMs: number) {
    if (this.samples.length >= MetricsService.MAX_SAMPLES) this.samples.shift();
    this.samples.push(durationMs);
  }

  averageResponseTimeMs(): number {
    if (this.samples.length === 0) return 0;
    const sum = this.samples.reduce((a, b) => a + b, 0);
    return Math.round(sum / this.samples.length);
  }

  uptimeSeconds(): number {
    return Math.round(process.uptime());
  }

  memoryUsagePercent(): number {
    const total = totalmem();
    return Math.round(((total - freemem()) / total) * 100);
  }
}
