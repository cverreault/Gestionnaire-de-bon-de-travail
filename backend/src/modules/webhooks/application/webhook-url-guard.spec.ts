import {
  assertPublicWebhookUrl,
  isReservedAddress,
  WebhookUrlError,
} from './webhook-url-guard';

describe('isReservedAddress (B26)', () => {
  it('flags loopback / private / metadata ranges', () => {
    for (const a of [
      '127.0.0.1',
      '10.1.2.3',
      '192.168.0.1',
      '172.16.5.5',
      '172.31.255.255',
      '169.254.169.254',
      '0.0.0.0',
      '::1',
      'fc00::1',
      'fd12::1',
      'fe80::1',
      '::ffff:127.0.0.1',
    ]) {
      expect(isReservedAddress(a)).toBe(true);
    }
  });
  it('allows public addresses', () => {
    for (const a of ['8.8.8.8', '1.1.1.1', '2001:db8::1']) {
      expect(isReservedAddress(a)).toBe(false);
    }
  });
});

describe('assertPublicWebhookUrl (B26)', () => {
  it('rejects non-http(s) schemes', async () => {
    await expect(assertPublicWebhookUrl('ftp://example.com')).rejects.toBeInstanceOf(
      WebhookUrlError,
    );
  });

  it('rejects an IP-literal in a reserved range', async () => {
    await expect(assertPublicWebhookUrl('http://169.254.169.254/latest', false)).rejects.toBeInstanceOf(
      WebhookUrlError,
    );
    await expect(assertPublicWebhookUrl('http://127.0.0.1:9000', false)).rejects.toThrow(
      /priv|SSRF/i,
    );
  });

  it('accepts a public IP literal and returns the pinned target', async () => {
    const t = await assertPublicWebhookUrl('https://8.8.8.8/hook', false);
    expect(t.address).toBe('8.8.8.8');
    expect(t.port).toBe(443);
  });

  it('enforces https in production mode', async () => {
    await expect(assertPublicWebhookUrl('http://8.8.8.8/hook', true)).rejects.toThrow(/https/i);
  });
});
