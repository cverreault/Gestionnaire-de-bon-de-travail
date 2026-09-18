import {
  BadRequestException,
  CallHandler,
  ConflictException,
  ExecutionContext,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  NestInterceptor,
  UnprocessableEntityException,
} from '@nestjs/common';
import { HTTP_CODE_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import { createHash } from 'node:crypto';
import { from, Observable, of } from 'rxjs';
import { catchError, mergeMap, switchMap, tap } from 'rxjs/operators';
import {
  IDEMPOTENCY_IN_PROGRESS,
  IDEMPOTENCY_KEY_HEADER,
  IDEMPOTENCY_KEY_REUSED,
  IDEMPOTENCY_REPLAYED_HEADER,
  IDEMPOTENCY_STORE,
  IDEMPOTENT_METADATA_KEY,
  type IIdempotencyStore,
  type IdempotencyScope,
} from '../contracts/idempotency.contract';

const KEY_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FILE_HASH_PREFIX_BYTES = 8 * 1024;

interface MulterFile {
  originalname?: string;
  mimetype?: string;
  size?: number;
  buffer?: Buffer;
}

/**
 * Replay-safe mutations (ADR-016 §3). Active only on handlers marked
 * `@Idempotent()` AND when the `Idempotency-Key` header is present.
 *
 *  - same key, same request hash  → stored response, `Idempotency-Replayed: true`
 *  - same key, different hash     → 422 IDEMPOTENCY_KEY_REUSED
 *  - key still in flight          → 409 IDEMPOTENCY_IN_PROGRESS
 *  - handler throws               → claim released, client may retry
 *
 * Runs before the response envelope (global TransformInterceptor wraps the
 * replayed body exactly like a fresh one).
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  private readonly logger = new Logger(IdempotencyInterceptor.name);

  constructor(
    private readonly reflector: Reflector,
    @Inject(IDEMPOTENCY_STORE) private readonly store: IIdempotencyStore,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const marked = this.reflector.get<boolean>(IDEMPOTENT_METADATA_KEY, context.getHandler());
    const req = context.switchToHttp().getRequest<Request & { user?: { id: string; tenantId: string }; file?: MulterFile }>();
    const rawKey = req.headers[IDEMPOTENCY_KEY_HEADER];
    const key = (Array.isArray(rawKey) ? rawKey[0] : rawKey)?.trim().toLowerCase();
    if (!marked || !key) return next.handle();
    if (!KEY_RE.test(key)) throw new BadRequestException('Idempotency-Key must be a UUID');
    if (!req.user?.id || !req.user.tenantId) return next.handle();

    const res = context.switchToHttp().getResponse<Response>();
    const scope: IdempotencyScope = { tenantId: req.user.tenantId, userId: req.user.id };
    const method = req.method.toUpperCase();
    const path = req.originalUrl.split('?')[0];
    const requestHash = hashRequest(method, path, req.body, req.file);
    const statusCode =
      this.reflector.get<number>(HTTP_CODE_METADATA, context.getHandler()) ??
      (method === 'POST' ? HttpStatus.CREATED : HttpStatus.OK);

    return from(this.store.begin(scope, { key, method, path, requestHash })).pipe(
      switchMap((claim) => {
        switch (claim.state) {
          case 'DONE':
            res.setHeader(IDEMPOTENCY_REPLAYED_HEADER, 'true');
            res.status(claim.statusCode);
            return of(claim.body);
          case 'MISMATCH':
            throw new UnprocessableEntityException({
              code: IDEMPOTENCY_KEY_REUSED,
              message: 'Idempotency-Key déjà utilisée avec une requête différente',
            });
          case 'IN_PROGRESS':
            throw new ConflictException({
              code: IDEMPOTENCY_IN_PROGRESS,
              message: 'Requête identique en cours de traitement',
            });
          case 'NEW':
            return next.handle().pipe(
              mergeMap((body) => from(this.store.complete(scope, key, statusCode, body)).pipe(switchMap(() => of(body)))),
              catchError((err) =>
                from(this.store.release(scope, key)).pipe(
                  tap({ error: (e) => this.logger.warn(`release failed for ${key}: ${e}`) }),
                  switchMap(() => {
                    throw err;
                  }),
                ),
              ),
            );
        }
      }),
    );
  }
}

/** sha256 of method + path + canonical JSON body (+ multipart facts). */
export function hashRequest(method: string, path: string, body: unknown, file?: MulterFile): string {
  const h = createHash('sha256');
  h.update(method).update('\n').update(path).update('\n').update(canonical(body));
  if (file) {
    h.update('\nfile:').update(String(file.size ?? 0)).update(':').update(file.mimetype ?? '').update(':').update(file.originalname ?? '');
    if (file.buffer) h.update(file.buffer.subarray(0, FILE_HASH_PREFIX_BYTES));
  }
  return h.digest('hex');
}

function canonical(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    return `{${Object.keys(obj)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical(obj[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}
