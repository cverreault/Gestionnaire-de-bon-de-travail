import { decodeSyncCursor, encodeSyncCursor } from './sync-protocol.contract';

describe('sync cursor codec (ADR-016 §1)', () => {
  it('round-trips and is opaque base64url', () => {
    const t = new Date('2026-09-18T12:00:00.123Z');
    const raw = encodeSyncCursor({ t, id: 'wo-1' });
    expect(raw).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeSyncCursor(raw)).toEqual({ v: 1, t: '2026-09-18T12:00:00.123Z', id: 'wo-1' });
  });

  it('rejects missing, garbage, tampered and foreign-version cursors', () => {
    expect(decodeSyncCursor(undefined)).toBeNull();
    expect(decodeSyncCursor('')).toBeNull();
    expect(decodeSyncCursor('not base64 json')).toBeNull();
    expect(decodeSyncCursor(Buffer.from('{"v":2,"t":"x","id":"y"}').toString('base64url'))).toBeNull();
    expect(decodeSyncCursor(Buffer.from('{"v":1,"t":"not-a-date","id":"y"}').toString('base64url'))).toBeNull();
  });
});
