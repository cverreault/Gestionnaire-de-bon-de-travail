import { PushChannelService } from './push-channel.service';

function make(mobile?: { hasActiveDevice: jest.Mock; sendToUser: jest.Mock }) {
  const configs = { resolve: jest.fn().mockResolvedValue(undefined) };
  const prisma = { pushSubscription: { findMany: jest.fn().mockResolvedValue([]) } };
  return { svc: new PushChannelService(configs as never, prisma as never, mobile as never), prisma };
}

describe('PushChannelService — native branch (ADR-015 §3)', () => {
  it('routes to the mobile sender and skips web push when the user has a live device', async () => {
    const mobile = { hasActiveDevice: jest.fn().mockResolvedValue(true), sendToUser: jest.fn().mockResolvedValue(true) };
    const { svc, prisma } = make(mobile);
    const woId = '3f9a2b1c-6d4e-4f8a-9b0c-1d2e3f4a5b6c';
    await expect(svc.send({ userId: 'u1', title: 'BT assigné', body: 'AS-1', url: `/bons-de-travail/${woId}` })).resolves.toBe(true);
    expect(mobile.sendToUser).toHaveBeenCalledWith({ userId: 'u1', title: 'BT assigné', body: 'AS-1', data: { url: `/bons-de-travail/${woId}`, workOrderId: woId } });
    expect(prisma.pushSubscription.findMany).not.toHaveBeenCalled();
  });

  it('falls back to web push (console mode here) without a device or without the mobile module', async () => {
    const mobile = { hasActiveDevice: jest.fn().mockResolvedValue(false), sendToUser: jest.fn() };
    const { svc } = make(mobile);
    await expect(svc.send({ userId: 'u1', title: 't' })).resolves.toBe(true);
    expect(mobile.sendToUser).not.toHaveBeenCalled();
    const { svc: alone } = make(undefined);
    await expect(alone.send({ userId: 'u1', title: 't' })).resolves.toBe(true);
  });
});
