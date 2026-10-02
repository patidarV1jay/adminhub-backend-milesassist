import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Request, Response } from 'express';

interface NormalizedError {
  statusCode: number;
  message: string | string[];
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();
    const { statusCode, message } = this.normalize(exception);

    if (statusCode >= 500) {
      this.logger.error(
        `${req.method} ${req.url}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    res.status(statusCode).json({
      statusCode,
      error: this.statusName(statusCode),
      message,
      path: req.url,
      timestamp: new Date().toISOString(),
    });
  }

  private normalize(exception: unknown): NormalizedError {
    if (exception instanceof HttpException) {
      const body = exception.getResponse();
      const message =
        typeof body === 'string'
          ? body
          : ((body as { message?: string | string[] }).message ?? exception.message);
      return { statusCode: exception.getStatus(), message };
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      switch (exception.code) {
        case 'P2002': {
          const target = (exception.meta?.target as string[] | string | undefined) ?? 'field';
          const fields = Array.isArray(target) ? target.join(', ') : target;
          return { statusCode: HttpStatus.CONFLICT, message: `A record with this ${fields} already exists` };
        }
        case 'P2025':
          return { statusCode: HttpStatus.NOT_FOUND, message: 'Record not found' };
        case 'P2003':
          return {
            statusCode: HttpStatus.CONFLICT,
            message: 'Operation violates a relation constraint (related record missing or still in use)',
          };
        default:
          return { statusCode: HttpStatus.INTERNAL_SERVER_ERROR, message: 'Database error' };
      }
    }

    if (exception instanceof Prisma.PrismaClientValidationError) {
      return { statusCode: HttpStatus.BAD_REQUEST, message: 'Invalid data supplied' };
    }
    return { statusCode: HttpStatus.INTERNAL_SERVER_ERROR, message: 'Internal server error' };
  }

  private statusName(status: number): string {
    const key = HttpStatus[status] ?? 'ERROR';
    return key
      .toLowerCase()
      .split('_')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  }
}
