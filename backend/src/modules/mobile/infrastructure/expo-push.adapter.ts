import { Inject, Injectable, Logger, Optional } from '@nestjs/common';

export const EXPO_PUSH_SEND_URL = 'https://exp.host/--/api/v2/push/send';
export const EXPO_PUSH_RECEIPTS_URL = 'https://exp.host/--/api/v2/push/getReceipts';
/** Expo accepts at most 100 messages per request. */
export const EXPO_PUSH_BATCH = 100;

export interface ExpoPushMessage {
  to: string;
  title: string;
  body?: string;
  data?: Record<string, unknown>;
  sound?: 'default' | null;
  priority?: 'default' | 'normal' | 'high';
  channelId?: string;
}

export interface ExpoPushTicket {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error?: string };
}

export interface ExpoPushReceipt {
  status: 'ok' | 'error';
  message?: string;
  details?: { error?: string };
}

export type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

/** Optional DI token to swap the HTTP layer (tests) ; global `fetch` otherwise. */
export const EXPO_FETCH = Symbol('EXPO_FETCH');

/**
 * Thin HTTP client of the Expo Push Service (ADR-015 §2). No SDK : two
 * endpoints, batches of 100, optional access token. Network failures never
 * throw ; they yield error tickets so callers can count and move on.
 */
@Injectable()
export class ExpoPushAdapter {
  private readonly logger = new Logger(ExpoPushAdapter.name);

  private readonly fetchImpl: FetchLike;

  constructor(@Optional() @Inject(EXPO_FETCH) fetchImpl?: FetchLike) {
    // A default parameter value is invisible to Nest's DI (it would try to
    // resolve `Function`) — hence the explicit optional token.
    this.fetchImpl = fetchImpl ?? ((url, init) => fetch(url, init));
  }

  static isExpoToken(token: string | null | undefined): token is string {
    return !!token && /^Expo(nent)?PushToken\[[^\]]+\]$/.test(token);
  }

  async send(messages: ExpoPushMessage[], accessToken?: string): Promise<ExpoPushTicket[]> {
    const tickets: ExpoPushTicket[] = [];
    for (let i = 0; i < messages.length; i += EXPO_PUSH_BATCH) {
      const batch = messages.slice(i, i + EXPO_PUSH_BATCH);
      try {
        const res = await this.fetchImpl(EXPO_PUSH_SEND_URL, { method: 'POST', headers: this.headers(accessToken), body: JSON.stringify(batch) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as { data?: ExpoPushTicket[] };
        const data = json.data ?? [];
        for (let k = 0; k < batch.length; k += 1) tickets.push(data[k] ?? { status: 'error', message: 'missing ticket' });
      } catch (err) {
        this.logger.warn(`Expo push send failed for ${batch.length} message(s): ${err instanceof Error ? err.message : err}`);
        for (const _ of batch) tickets.push({ status: 'error', message: 'transport' });
      }
    }
    return tickets;
  }

  async receipts(ids: string[], accessToken?: string): Promise<Record<string, ExpoPushReceipt>> {
    const out: Record<string, ExpoPushReceipt> = {};
    for (let i = 0; i < ids.length; i += EXPO_PUSH_BATCH) {
      const batch = ids.slice(i, i + EXPO_PUSH_BATCH);
      try {
        const res = await this.fetchImpl(EXPO_PUSH_RECEIPTS_URL, { method: 'POST', headers: this.headers(accessToken), body: JSON.stringify({ ids: batch }) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as { data?: Record<string, ExpoPushReceipt> };
        Object.assign(out, json.data ?? {});
      } catch (err) {
        this.logger.warn(`Expo receipts failed for ${batch.length} id(s): ${err instanceof Error ? err.message : err}`);
      }
    }
    return out;
  }

  private headers(accessToken?: string): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'Accept-Encoding': 'gzip, deflate',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    };
  }
}
