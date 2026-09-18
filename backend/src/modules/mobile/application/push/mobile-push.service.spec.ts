import { MobilePushService } from './mobile-push.service';

const DEV = (id: string, token: string | null = `ExponentPushToken[${id}]`) => ({ id, pushToken: token, platform: 'IOS' });

function make(devices: unknown[], config: Record<string, string | undefined> = {}) {
  const prisma = {
    device: { findMany: jest.fn().mockResolvedValue(devices), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
  };
  const expo = { send: jest.fn(), receipts: jest.fn().mockResolvedValue({}) };
  const configs = { resolve: jest.fn((k: string) => Promise.resolve(config[k])) };
  const svc = new MobilePushService(prisma as never, expo as never, configs as never);
  return { svc, prisma, expo, configs };
}

describe('MobilePushService (B37.4, ADR-015)', () => {
  it('queries only live devices (not revoked, token present, seen in 30 days)', async () => {
    const { svc, prisma } = make([DEV('d1')]);
    await expect(svc.hasActiveDevice('u1')).resolves.toBe(true);
    const where = prisma.device.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ userId: 'u1', revokedAt: null, pushToken: { not: null }, pushTokenInvalidatedAt: null });
    expect(where.lastSeenAt.gt).toBeInstanceOf(Date);
  });

  it('is disabled by mobile.push.enabled=false', async () => {
    const { svc, expo } = make([DEV('d1')], { 'mobile.push.enabled': 'false' });
    await expect(svc.hasActiveDevice('u1')).resolves.toBe(false);
    await expect(svc.sendToUser({ userId: 'u1', title: 't' })).resolves.toBe(false);
    expect(expo.send).not.toHaveBeenCalled();
  });

  it('sends one message per device with the access token, keeps tickets, and purges DeviceNotRegistered right away', async () => {
    const { svc, prisma, expo } = make([DEV('d1'), DEV('d2'), DEV('d3', 'not-an-expo-token')], { 'mobile.expo-access-token': 'tok' });
    expo.send.mockResolvedValue([{ status: 'ok', id: 't1' }, { status: 'error', details: { error: 'DeviceNotRegistered' } }]);
    await expect(svc.sendToUser({ userId: 'u1', title: 'Nouveau BT', body: 'AS-1', data: { workOrderId: 'w' } })).resolves.toBe(true);
    expect(expo.send).toHaveBeenCalledWith(
      [
        expect.objectContaining({ to: 'ExponentPushToken[d1]', title: 'Nouveau BT', body: 'AS-1', data: { workOrderId: 'w' } }),
        expect.objectContaining({ to: 'ExponentPushToken[d2]' }),
      ],
      'tok',
    );
    expect(prisma.device.updateMany).toHaveBeenCalledWith({ where: { id: 'd2' }, data: { pushToken: null, pushTokenInvalidatedAt: expect.any(Date) } });
    expect(svc.pendingCount()).toBe(1);
  });

  it('returns false when no device accepted the message', async () => {
    const { svc, expo } = make([DEV('d1')]);
    expo.send.mockResolvedValue([{ status: 'error', message: 'transport' }]);
    await expect(svc.sendToUser({ userId: 'u1', title: 't' })).resolves.toBe(false);
  });

  it('polls receipts and invalidates tokens reported unregistered', async () => {
    const { svc, prisma, expo } = make([DEV('d1'), DEV('d2')]);
    expo.send.mockResolvedValue([{ status: 'ok', id: 't1' }, { status: 'ok', id: 't2' }]);
    await svc.sendToUser({ userId: 'u1', title: 't' });
    expo.receipts.mockResolvedValue({ t1: { status: 'ok' }, t2: { status: 'error', details: { error: 'DeviceNotRegistered' } } });
    await expect(svc.pollReceipts()).resolves.toBe(1);
    expect(expo.receipts).toHaveBeenCalledWith(['t1', 't2'], undefined);
    expect(prisma.device.updateMany).toHaveBeenCalledWith({ where: { id: 'd2' }, data: expect.objectContaining({ pushToken: null }) });
    expect(svc.pendingCount()).toBe(0);
    await expect(svc.pollReceipts()).resolves.toBe(0);
  });
});
