import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Request-scoped context propagation (B6.3).
 *
 * Uses Node's AsyncLocalStorage so any service — buried under multiple
 * `await`s, scheduler callbacks, or background tasks initiated by a
 * request — can read the current tenant + user without threading it
 * through every signature.
 *
 * The middleware (set in main.ts via app.use()) starts the store at
 * the head of every request and the rest of the stack reads from it
 * through `current()`.
 *
 * For background jobs / crons / startup hooks where there is no
 * inbound request, `current()` returns null. Code that depends on the
 * context must handle that case explicitly.
 */

export interface RequestContext {
  tenantId: string;
  userId: string | null;
}

@Injectable()
export class RequestContextService {
  private readonly als = new AsyncLocalStorage<RequestContext>();

  /** Run the provided callback inside a new context store. */
  run<R>(ctx: RequestContext, callback: () => R): R {
    return this.als.run(ctx, callback);
  }

  /**
   * Run the callback in a copy of the current context with some fields
   * overridden — e.g. auth flows on an implicit host (apex / www) that must
   * operate in the tenant carried by the credential, not by the Host header.
   */
  runWith<R>(patch: Partial<RequestContext>, callback: () => R): R {
    const base: RequestContext = this.current() ?? { tenantId: patch.tenantId ?? '', userId: null };
    return this.als.run({ ...base, ...patch }, callback);
  }

  /** Read the current context. Returns null when called outside any request. */
  current(): RequestContext | null {
    return this.als.getStore() ?? null;
  }

  /** Shortcut for the common "I need the tenant id" case. Throws when absent. */
  requireTenantId(): string {
    const ctx = this.current();
    if (!ctx) {
      throw new Error(
        'RequestContextService.requireTenantId() called outside a request context.',
      );
    }
    return ctx.tenantId;
  }
}
