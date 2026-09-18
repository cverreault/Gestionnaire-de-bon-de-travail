import { ExpoPushAdapter, EXPO_PUSH_SEND_URL, type FetchLike } from './expo-push.adapter';

function fetchMock(responses: Array<{ ok: boolean; status?: number; body?: unknown } | Error>) {
  const calls: Array<{ url: string; body: unknown; auth?: string }> = [];
  const impl: FetchLike = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body), auth: init.headers.Authorization });
    const r = responses.shift();
    if (r instanceof Error) throw r;
    return { ok: r?.ok ?? true, status: r?.status ?? 200, json: async () => r?.body ?? {} };
  };
  return { impl, calls };
}

describe('ExpoPushAdapter (ADR-015 §2)', () => {
  it('recognises Expo tokens', () => {
    expect(ExpoPushAdapter.isExpoToken('ExponentPushToken[abc123]')).toBe(true);
    expect(ExpoPushAdapter.isExpoToken('ExpoPushToken[x]')).toBe(true);
    expect(ExpoPushAdapter.isExpoToken('fcm-token')).toBe(false);
    expect(ExpoPushAdapter.isExpoToken(null)).toBe(false);
  });

  it('splits sends into batches of 100 and aligns tickets with messages', async () => {
    const messages = Array.from({ length: 150 }, (_, i) => ({ to: `ExponentPushToken[${i}]`, title: 't' }));
    const { impl, calls } = fetchMock([
      { ok: true, body: { data: Array.from({ length: 100 }, (_, i) => ({ status: 'ok', id: `id-${i}` })) } },
      { ok: true, body: { data: Array.from({ length: 50 }, (_, i) => ({ status: 'ok', id: `id-${100 + i}` })) } },
    ]);
    const tickets = await new ExpoPushAdapter(impl).send(messages, 'secret');
    expect(calls).toHaveLength(2);
    expect(calls[0].url).toBe(EXPO_PUSH_SEND_URL);
    expect((calls[0].body as unknown[]).length).toBe(100);
    expect(calls[0].auth).toBe('Bearer secret');
    expect(tickets).toHaveLength(150);
    expect(tickets[149]).toEqual({ status: 'ok', id: 'id-149' });
  });

  it('turns transport and HTTP failures into error tickets instead of throwing', async () => {
    const { impl } = fetchMock([new Error('ECONNRESET'), { ok: false, status: 503 }]);
    const adapter = new ExpoPushAdapter(impl);
    expect(await adapter.send([{ to: 'a', title: 't' }])).toEqual([{ status: 'error', message: 'transport' }]);
    expect(await adapter.send([{ to: 'a', title: 't' }])).toEqual([{ status: 'error', message: 'transport' }]);
    expect(await adapter.receipts(['x'])).toEqual({});
  });
});
