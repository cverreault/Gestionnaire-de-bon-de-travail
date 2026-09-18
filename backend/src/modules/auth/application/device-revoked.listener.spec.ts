import { DeviceRevokedListener } from './device-revoked.listener';

describe('DeviceRevokedListener (B37.3)', () => {
  it('revokes every live refresh token of the installation for that user only', async () => {
    const prisma = { refreshToken: { updateMany: jest.fn().mockResolvedValue({ count: 2 }) } };
    const listener = new DeviceRevokedListener(prisma as never);
    await listener.onDeviceRevoked({ tenantId: 't', installationId: 'inst-1', userId: 'u-1', reason: 'user' });
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { deviceId: 'inst-1', userId: 'u-1', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });
});
