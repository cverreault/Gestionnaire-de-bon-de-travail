import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import * as Sentry from '@sentry/node';

export interface ErrorResponse {
  statusCode: number;
  timestamp: string;
  path: string;
  method: string;
  message: string | string[];
  error?: string;
}

@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const status = exception.getStatus
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;

    const exceptionResponse = exception.getResponse();
    const message =
      typeof exceptionResponse === 'object' && 'message' in exceptionResponse
        ? (exceptionResponse as any).message
        : exception.message;

    const errorBody: ErrorResponse = {
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      method: request.method,
      message,
      error:
        typeof exceptionResponse === 'object' && 'error' in exceptionResponse
          ? (exceptionResponse as any).error
          : undefined,
    };

    if (status >= 500) {
      this.logger.error(
        `${request.method} ${request.url} → ${status}`,
        exception.stack,
      );
      // Forward 5xx to Sentry when SENTRY_DSN is configured. No-op
      // otherwise — captureException is a safe no-op without init().
      // Enrich with the request's tenant + user so an incident on a
      // specific tenant is grep-able in the Sentry UI.
      const req = request as unknown as {
        method: string;
        url: string;
        headers?: Record<string, string | string[] | undefined>;
        tenant?: { id?: string; slug?: string };
        user?: { id?: string; email?: string; role?: string };
      };
      Sentry.captureException(exception, {
        tags: {
          tenantId: req.tenant?.id ?? 'unknown',
          tenantSlug: req.tenant?.slug ?? 'unknown',
          role: req.user?.role ?? 'anonymous',
        },
        user: req.user
          ? { id: req.user.id, email: req.user.email }
          : undefined,
        extra: {
          method: req.method,
          url: req.url,
          requestId: req.headers?.['x-request-id'] as string | undefined,
        },
      });
    } else {
      // Include the request body for 4xx errors so validation failures are
      // debuggable from the log (the client only sees the message). The
      // password field is redacted before dumping — `password`, `oldPassword`
      // and `newPassword` are all masked recursively.
      const redactedBody = redactSecrets(request.body);
      this.logger.warn(
        `${request.method} ${request.url} → ${status}: ${JSON.stringify(message)} — body=${JSON.stringify(redactedBody)}`,
      );
    }

    response.status(status).json(errorBody);
  }
}

const SECRET_KEYS = new Set(['password', 'oldPassword', 'newPassword', 'token']);

function redactSecrets(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(redactSecrets);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = SECRET_KEYS.has(k)
      ? typeof v === 'string' && v.length > 0
        ? '••••••••'
        : v
      : redactSecrets(v);
  }
  return out;
}
