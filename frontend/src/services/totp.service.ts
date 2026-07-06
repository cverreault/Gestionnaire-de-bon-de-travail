import api from './api';

export interface TotpStatus {
  enabled: boolean;
}

export interface TotpSetupResult {
  otpauthUrl: string;
  secret: string;
  backupCodes: string[];
}

function unwrap<T>(raw: unknown): T {
  if (raw && typeof raw === 'object' && 'data' in (raw as Record<string, unknown>)) {
    return (raw as { data: T }).data;
  }
  return raw as T;
}

export async function getTotpStatus(): Promise<TotpStatus> {
  const { data } = await api.get('/auth/2fa/status');
  return unwrap<TotpStatus>(data);
}

export async function beginTotpSetup(): Promise<TotpSetupResult> {
  const { data } = await api.post('/auth/2fa/setup');
  return unwrap<TotpSetupResult>(data);
}

export async function enableTotp(code: string): Promise<void> {
  await api.post('/auth/2fa/enable', { code });
}

export async function disableTotp(currentPassword: string, code: string): Promise<void> {
  await api.post('/auth/2fa/disable', { currentPassword, code });
}

/** Complete a 2FA-gated login by exchanging the pending token + code. */
export async function login2fa(
  pendingToken: string,
  code: string,
): Promise<{ accessToken: string; refreshToken: string; user: unknown }> {
  const { data } = await api.post('/auth/login/2fa', { pendingToken, code });
  return unwrap(data);
}
