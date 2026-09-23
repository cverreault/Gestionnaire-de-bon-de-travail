import { dateFilterEndExclusive, dateFilterStart, startOfLocalDay } from './work-orders.service';

/** B58 — the « jour » period must cover work orders stored at local midnight (04:00Z in Toronto). */
describe('date filters (local day bounds)', () => {
  const tz = process.env.TZ;
  beforeAll(() => { process.env.TZ = 'America/Toronto'; });
  afterAll(() => { if (tz) process.env.TZ = tz; else delete process.env.TZ; });

  it('a bare date spans the whole local day', () => {
    expect(dateFilterStart('2026-09-23').toISOString()).toBe('2026-09-23T04:00:00.000Z');
    expect(dateFilterEndExclusive('2026-09-23').toISOString()).toBe('2026-09-24T04:00:00.000Z');
    const storedAtLocalMidnight = new Date('2026-09-23T04:00:00.000Z');
    expect(storedAtLocalMidnight >= dateFilterStart('2026-09-23')).toBe(true);
    expect(storedAtLocalMidnight < dateFilterEndExclusive('2026-09-23')).toBe(true);
  });

  it('an instant is used as is', () => {
    expect(dateFilterStart('2026-09-23T10:00:00.000Z').toISOString()).toBe('2026-09-23T10:00:00.000Z');
    expect(dateFilterEndExclusive('2026-09-23T10:00:00.000Z').toISOString()).toBe('2026-09-23T10:00:00.001Z');
  });

  it('startOfLocalDay handles a winter date (EST)', () => {
    expect(startOfLocalDay(new Date('2026-01-15T12:00:00Z')).toISOString()).toBe('2026-01-15T05:00:00.000Z');
  });
});
