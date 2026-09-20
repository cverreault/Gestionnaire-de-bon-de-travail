import { StreamableFile } from '@nestjs/common';
import { lastValueFrom, of } from 'rxjs';
import { Readable } from 'stream';
import { TransformInterceptor } from './transform.interceptor';

describe('TransformInterceptor', () => {
  const ctx = {} as never;
  it('wraps JSON payloads in the envelope', async () => {
    const out = await lastValueFrom(new TransformInterceptor().intercept(ctx, { handle: () => of({ id: 1 }) }));
    expect(out).toMatchObject({ success: true, data: { id: 1 }, timestamp: expect.any(String) });
  });
  it('passes StreamableFile through untouched (attachment content proxy)', async () => {
    const file = new StreamableFile(Readable.from(['x']));
    const out = await lastValueFrom(new TransformInterceptor().intercept(ctx, { handle: () => of(file) }));
    expect(out).toBe(file);
  });
});
