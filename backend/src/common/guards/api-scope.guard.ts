import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import {
  ApiKeysService,
  type ApiKeyScope,
} from '../../modules/api-keys/api-keys.service';
import type { ResolvedApiKey } from '../contracts/api-key.contract';
import { SCOPE_METADATA_KEY } from '../decorators/scope.decorator';
import { API_KEY_REQUEST_KEY } from './api-key-auth.guard';

/**
 * Enforces the `@Scope()` annotation on a public-API endpoint (B8).
 *
 * Runs after `ApiKeyAuthGuard` has populated `req[API_KEY_REQUEST_KEY]`.
 * Reads the required scope from the metadata set by `@Scope()`, compares
 * to the key's actual scope via the hierarchy `admin ⊇ read-write ⊇
 * read-only`, and throws 403 on insufficient scope.
 */
@Injectable()
export class ApiScopeGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly apiKeys: ApiKeysService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    // Registered as APP_GUARD — short-circuit for anything outside /api/v1/*,
    // and for the Swagger doc route which is intentionally public.
    if (
      !req.url?.startsWith('/api/v1/') ||
      req.url.startsWith('/api/v1/docs')
    ) {
      return true;
    }

    const required = this.reflector.getAllAndOverride<ApiKeyScope>(
      SCOPE_METADATA_KEY,
      [context.getHandler(), context.getClass()],
    );

    const key = (req as Request & Record<string, unknown>)[
      API_KEY_REQUEST_KEY
    ] as ResolvedApiKey | undefined;

    if (!key) {
      // If the ApiKeyAuthGuard didn't attach a key, we're on /api/v1/*
      // with no auth — deny hard, don't rely on downstream to catch.
      throw new UnauthorizedException(
        'Route publique v1 sans clé API authentifiée',
      );
    }

    // Fail-safe : an endpoint that forgot `@Scope()` still gets checked
    // against the strictest bundle (`admin`). Rather than silently letting
    // a read-only key call an unannotated write endpoint, we require the
    // developer to think about the scope explicitly.
    const effectiveRequired: ApiKeyScope = required ?? 'admin';
    this.apiKeys.assertScopeSatisfies(key.scope, effectiveRequired);
    return true;
  }
}
