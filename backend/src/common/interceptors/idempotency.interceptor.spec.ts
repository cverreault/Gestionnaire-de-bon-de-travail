import { BadRequestException, ConflictException, HttpStatus, UnprocessableEntityException } from '@nestjs/common';
import { HTTP_CODE_METADATA } from '@nestjs/common/constants';
import { lastValueFrom, of, throwError } from 'rxjs';
import { IDEMPOTENT_METADATA_KEY, type IdempotencyBegin } from '../contracts/idempotency.contract';
import { hashRequest, IdempotencyInterceptor } from './idempotency.interceptor';

const KEY = '3f9a2b1c-6d4e-4f8a-9b0c-1d2e3f4a5b6c';

function setup(opts: { marked?: boolean; header?: string; begin?: IdempotencyBegin; httpCode?: number; body?: unknown; user?: unknown } = {}) {
  const reflector = {
    get: jest.fn((meta: string) => {
      if (meta === IDEMPOTENT_METADATA_KEY) return opts.marked ?? true;
      if (meta === HTTP_CODE_METADATA) return opts.httpCode;
      return undefined;
    }),
  };
  const store = {
    begin: jest.fn().mockResolvedValue(opts.begin ?? { state: 'NEW' }),
    complete: jest.fn().mockResolvedValue(undefined),
    release: jest.fn().mockResolvedValue(undefined),
  };
  const res = { setHeader: jest.fn(), status: jest.fn() };
  const req = {
    headers: opts.header === undefined ? {} : { 'idempotency-key': opts.header },
    user: opts.user === undefined ? { id: 'u-1', tenantId: 't-1' } : opts.user,
    method: 'POST',
    originalUrl: '/api/work-orders/wo-1/notes?x=1',
    body: opts.body ?? { content: 'hello' },
  };
  const ctx = { getHandler: () => ({}), switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }) };
  const handler = { handle: jest.fn(() => of({ id: 'note-1' })) };
  const interceptor = new IdempotencyInterceptor(reflector as never, store as never);
  return { interceptor, ctx, handler, store, res };
}

describe('IdempotencyInterceptor (B37.5)', () => {
  it('passes through when the handler is not marked or the header is absent', async () => {
    const a = setup({ marked: false, header: KEY });
    await lastValueFrom(a.interceptor.intercept(a.ctx as never, a.handler));
    expect(a.store.begin).not.toHaveBeenCalled();
    const b = setup({ header: undefined });
    await lastValueFrom(b.interceptor.intercept(b.ctx as never, b.handler));
    expect(b.store.begin).not.toHaveBeenCalled();
    expect(b.handler.handle).toHaveBeenCalled();
  });

  it('rejects a malformed key with 400', () => {
    const s = setup({ header: 'not-a-uuid' });
    expect(() => s.interceptor.intercept(s.ctx as never, s.handler)).toThrow(BadRequestException);
  });

  it('claims the key, runs the handler and stores the response with the route status code', async () => {
    const s = setup({ header: KEY, httpCode: HttpStatus.CREATED });
    const out = await lastValueFrom(s.interceptor.intercept(s.ctx as never, s.handler));
    expect(out).toEqual({ id: 'note-1' });
    expect(s.store.begin).toHaveBeenCalledWith(
      { tenantId: 't-1', userId: 'u-1' },
      expect.objectContaining({ key: KEY, method: 'POST', path: '/api/work-orders/wo-1/notes', requestHash: expect.any(String) }),
    );
    expect(s.store.complete).toHaveBeenCalledWith({ tenantId: 't-1', userId: 'u-1' }, KEY, 201, { id: 'note-1' });
    expect(s.res.setHeader).not.toHaveBeenCalled();
  });

  it('replays a stored response and flags it', async () => {
    const s = setup({ header: KEY, begin: { state: 'DONE', statusCode: 201, body: { id: 'note-1' } } });
    const out = await lastValueFrom(s.interceptor.intercept(s.ctx as never, s.handler));
    expect(out).toEqual({ id: 'note-1' });
    expect(s.handler.handle).not.toHaveBeenCalled();
    expect(s.res.setHeader).toHaveBeenCalledWith('Idempotency-Replayed', 'true');
    expect(s.res.status).toHaveBeenCalledWith(201);
  });

  it('answers 422 on a reused key with another body and 409 while in flight', async () => {
    const m = setup({ header: KEY, begin: { state: 'MISMATCH' } });
    await expect(lastValueFrom(m.interceptor.intercept(m.ctx as never, m.handler))).rejects.toBeInstanceOf(UnprocessableEntityException);
    const p = setup({ header: KEY, begin: { state: 'IN_PROGRESS' } });
    await expect(lastValueFrom(p.interceptor.intercept(p.ctx as never, p.handler))).rejects.toBeInstanceOf(ConflictException);
  });

  it('releases the claim when the handler fails so the client can retry', async () => {
    const s = setup({ header: KEY });
    s.handler.handle.mockReturnValue(throwError(() => new Error('boom')));
    await expect(lastValueFrom(s.interceptor.intercept(s.ctx as never, s.handler))).rejects.toThrow('boom');
    expect(s.store.release).toHaveBeenCalledWith({ tenantId: 't-1', userId: 'u-1' }, KEY);
    expect(s.store.complete).not.toHaveBeenCalled();
  });
});

describe('hashRequest', () => {
  it('is order-insensitive for JSON keys and sensitive to values, path and file prefix', () => {
    const a = hashRequest('POST', '/x', { a: 1, b: [1, 2] });
    expect(hashRequest('POST', '/x', { b: [1, 2], a: 1 })).toBe(a);
    expect(hashRequest('POST', '/x', { a: 2, b: [1, 2] })).not.toBe(a);
    expect(hashRequest('POST', '/y', { a: 1, b: [1, 2] })).not.toBe(a);
    const f1 = hashRequest('POST', '/up', {}, { size: 10, mimetype: 'image/jpeg', originalname: 'a.jpg', buffer: Buffer.from('0123456789') });
    const f2 = hashRequest('POST', '/up', {}, { size: 10, mimetype: 'image/jpeg', originalname: 'a.jpg', buffer: Buffer.from('0123456780') });
    expect(f1).not.toBe(f2);
  });
});
