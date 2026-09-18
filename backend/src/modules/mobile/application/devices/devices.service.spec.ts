import { NotFoundException } from '@nestjs/common';
import { DevicePlatform } from '@prisma/client';
import { DevicesService } from './devices.service';
import { MOBILE_DEVICE_REGISTERED_EVENT, MOBILE_DEVICE_REVOKED_EVENT } from '../../../../common/contracts/mobile-events.contract';

const OWNER = { id: 'u-1', tenantId: 't-1' };
const BASE = {
  id: 'd-1', tenantId: 't-1', installationId: 'inst-1', userId: 'u-1', platform: DevicePlatform.IOS, provider: 'EXPO',
  pushToken: 'ExponentPushToken[a]', pushTokenInvalidatedAt: null, appVersion: '0.1.0', osVersion: '27.0', model: 'iPhone', locale: 'fr',
  lastSeenAt: new Date('2026-09-18T10:00:00Z'), revokedAt: null, createdAt: new Date('2026-09-01'), updatedAt: new Date(),
};

function make(existing: unknown = null) {
  const prisma = {
    device: {
      findUnique: jest.fn().mockResolvedValue(existing),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...BASE, ...data, id: 'd-new' })),
      update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...BASE, ...(existing as object), ...data })),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  };
  const events = { emit: jest.fn(), emitAsync: jest.fn().mockResolvedValue([]) };
  const config = {
    upgradeRequired: jest.fn().mockResolvedValue({ upgradeRequired: false, minAppVersion: '0.0.0' }),
    versionPolicy: jest.fn().mockResolvedValue({ minAppVersion: { ios: '0.0.0', android: '0.0.0' }, latestAppVersion: null }),
  };
  const svc = new DevicesService(prisma as never, events as never, config as never);
  return { svc, prisma, events, config };
}

describe('DevicesService (B37.3)', () => {
  it('creates the row on first registration and emits registered', async () => {
    const { svc, prisma, events } = make(null);
    const view = await svc.register(OWNER, 'inst-1', { platform: DevicePlatform.IOS, appVersion: '0.1.0', pushToken: 'ExponentPushToken[a]' });
    expect(prisma.device.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ tenantId: 't-1', installationId: 'inst-1', userId: 'u-1', pushToken: 'ExponentPushToken[a]' }),
    }));
    expect(events.emit).toHaveBeenCalledWith(MOBILE_DEVICE_REGISTERED_EVENT, expect.objectContaining({ installationId: 'inst-1', relinked: false }));
    expect(view.hasPushToken).toBe(true);
    expect(view).not.toHaveProperty('pushToken');
  });

  it('re-links a shared phone to the new user, drops the old push token and emits registered', async () => {
    const { svc, prisma, events } = make({ ...BASE, userId: 'u-other' });
    await svc.register(OWNER, 'inst-1', { platform: DevicePlatform.IOS, appVersion: '0.2.0' });
    expect(prisma.device.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ userId: 'u-1', pushToken: null, revokedAt: null }),
    }));
    expect(events.emit).toHaveBeenCalledWith(MOBILE_DEVICE_REGISTERED_EVENT, expect.objectContaining({ relinked: true, userId: 'u-1' }));
  });

  it('stays silent on a plain re-registration by the same user', async () => {
    const { svc, events } = make(BASE);
    await svc.register(OWNER, 'inst-1', { platform: DevicePlatform.IOS, appVersion: '0.2.0' });
    expect(events.emit).not.toHaveBeenCalled();
  });

  it('detaches a push token that moved to another installation (reinstall)', async () => {
    const { svc, prisma } = make(null);
    await svc.register(OWNER, 'inst-2', { platform: DevicePlatform.ANDROID, appVersion: '0.1.0', pushToken: 'tok' });
    expect(prisma.device.updateMany).toHaveBeenCalledWith({
      where: { pushToken: 'tok', NOT: { tenantId: 't-1', installationId: 'inst-2' } },
      data: { pushToken: null, pushTokenInvalidatedAt: expect.any(Date) },
    });
  });

  it('heartbeat refreshes lastSeenAt and returns the version gate', async () => {
    const { svc, prisma, config } = make(BASE);
    config.upgradeRequired.mockResolvedValue({ upgradeRequired: true, minAppVersion: '1.0.0' });
    const out = await svc.heartbeat(OWNER, 'inst-1', { appVersion: '0.9.0' });
    expect(prisma.device.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ appVersion: '0.9.0', lastSeenAt: expect.any(Date) }) }));
    expect(config.upgradeRequired).toHaveBeenCalledWith(DevicePlatform.IOS, '0.9.0');
    expect(out).toMatchObject({ upgradeRequired: true, minAppVersion: '1.0.0' });
  });

  it('answers 404 for another user, a revoked or an unknown installation (never 403)', async () => {
    await expect(make({ ...BASE, userId: 'u-other' }).svc.heartbeat(OWNER, 'inst-1', {})).rejects.toBeInstanceOf(NotFoundException);
    await expect(make({ ...BASE, revokedAt: new Date() }).svc.revoke(OWNER, 'inst-1')).rejects.toBeInstanceOf(NotFoundException);
    await expect(make(null).svc.revoke(OWNER, 'nope')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('revoke soft-deletes, clears the push token and awaits the revoked event', async () => {
    const { svc, prisma, events } = make(BASE);
    await svc.revoke(OWNER, 'inst-1');
    expect(prisma.device.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ revokedAt: expect.any(Date), pushToken: null }) }));
    expect(events.emitAsync).toHaveBeenCalledWith(MOBILE_DEVICE_REVOKED_EVENT, { tenantId: 't-1', installationId: 'inst-1', userId: 'u-1', reason: 'user' });
  });

  it('lists only live devices of the caller', async () => {
    const { svc, prisma } = make();
    await svc.listMine(OWNER);
    expect(prisma.device.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { tenantId: 't-1', userId: 'u-1', revokedAt: null } }));
  });
});
