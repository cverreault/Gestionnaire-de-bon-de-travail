/**
 * QA — notifications.listener.spec.ts
 *
 * Locks the channel-routing behaviour at the listener seam. Channel
 * services are stubbed; we exercise the listener's decision logic:
 *   1. Persists the in-app row for every event
 *   2. Honours prefs : skipped channel is not called
 *   3. channelsSent reflects only the channels the user opted into
 *      AND that succeeded
 *   4. Listener never throws — even if a channel fails
 *   5. The 'in-app' channel always counts (the row exists in the inbox)
 */

import { Logger } from '@nestjs/common';
import { NotificationsListener } from './notifications.listener';
import type { NotificationsService } from './notifications.service';
import type { EmailChannelService } from '../infrastructure/channels/email-channel.service';
import type { PushChannelService } from '../infrastructure/channels/push-channel.service';
import type { PrismaService } from '../../../common/prisma/prisma.service';

function buildListener(opts: {
  prefs?: { inApp?: boolean; email?: boolean; push?: boolean };
  emailOk?: boolean;
  pushOk?: boolean;
  userHasEmail?: boolean;
}) {
  const eventPrefs = {
    inApp: opts.prefs?.inApp ?? true,
    email: opts.prefs?.email ?? true,
    push:  opts.prefs?.push  ?? true,
  };

  const notifications = {
    getPreferences: jest.fn().mockResolvedValue({
      'workOrder.assigned':  eventPrefs,
      'workOrder.completed': { inApp: true, email: false, push: false },
    }),
    create:   jest.fn().mockResolvedValue({ id: 'n-1', userId: 'tech-1' }),
    markSent: jest.fn().mockResolvedValue({ id: 'n-1' }),
  } as unknown as NotificationsService;

  const email = {
    send: jest.fn().mockResolvedValue(opts.emailOk ?? true),
  } as unknown as EmailChannelService;

  const push = {
    send: jest.fn().mockResolvedValue(opts.pushOk ?? true),
  } as unknown as PushChannelService;

  const prisma = {
    user: {
      findUnique: jest.fn().mockResolvedValue(
        opts.userHasEmail === false
          ? { email: null, firstName: 'T', lastName: 'Ech' }
          : { email: 'tech@x.io', firstName: 'T', lastName: 'Ech' },
      ),
    },
  } as unknown as PrismaService;

  const listener = new NotificationsListener(notifications, email, push, prisma);

  // Silence the in-test logger noise.
  jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

  return { listener, notifications: notifications as any, email: email as any, push: push as any, prisma: prisma as any };
}

const ASSIGNED_EVENT = {
  name: 'workOrders.workOrder.assigned' as const,
  eventId: 'evt-1',
  aggregateId: 'wo-42',
  occurredAt: new Date('2026-06-15T10:00:00Z'),
  actorUserId: 'admin-1',
  data: { technicianId: 'tech-1', previousTechnicianId: null },
};

describe('NotificationsListener.onWorkOrderAssigned', () => {
  it('persists the in-app row + dispatches every channel the user enabled', async () => {
    const { listener, notifications, email, push } = buildListener({});

    await listener.onWorkOrderAssigned(ASSIGNED_EVENT as any);

    expect(notifications.create).toHaveBeenCalledTimes(1);
    expect(notifications.create.mock.calls[0][0]).toMatchObject({
      userId: 'tech-1',
      type: 'workOrder.assigned',
      aggregateId: 'wo-42',
    });

    expect(email.send).toHaveBeenCalledTimes(1);
    expect(push.send).toHaveBeenCalledTimes(1);

    expect(notifications.markSent).toHaveBeenCalledWith('n-1', ['in-app', 'email', 'push']);
  });

  it('skips the email channel when prefs.email is off', async () => {
    const { listener, email, notifications } = buildListener({
      prefs: { email: false },
    });

    await listener.onWorkOrderAssigned(ASSIGNED_EVENT as any);

    expect(email.send).not.toHaveBeenCalled();
    expect(notifications.markSent).toHaveBeenCalledWith('n-1', ['in-app', 'push']);
  });

  it('skips the push channel when prefs.push is off', async () => {
    const { listener, push, notifications } = buildListener({
      prefs: { push: false },
    });

    await listener.onWorkOrderAssigned(ASSIGNED_EVENT as any);

    expect(push.send).not.toHaveBeenCalled();
    expect(notifications.markSent).toHaveBeenCalledWith('n-1', ['in-app', 'email']);
  });

  it('still creates the inbox row even when ALL external channels are off', async () => {
    const { listener, email, push, notifications } = buildListener({
      prefs: { email: false, push: false },
    });

    await listener.onWorkOrderAssigned(ASSIGNED_EVENT as any);

    expect(notifications.create).toHaveBeenCalledTimes(1);
    expect(email.send).not.toHaveBeenCalled();
    expect(push.send).not.toHaveBeenCalled();
    expect(notifications.markSent).toHaveBeenCalledWith('n-1', ['in-app']);
  });

  it('drops "email" from channelsSent when the email channel fails', async () => {
    const { listener, notifications } = buildListener({ emailOk: false });

    await listener.onWorkOrderAssigned(ASSIGNED_EVENT as any);

    expect(notifications.markSent).toHaveBeenCalledWith('n-1', ['in-app', 'push']);
  });

  it('drops "push" from channelsSent when the push channel fails', async () => {
    const { listener, notifications } = buildListener({ pushOk: false });

    await listener.onWorkOrderAssigned(ASSIGNED_EVENT as any);

    expect(notifications.markSent).toHaveBeenCalledWith('n-1', ['in-app', 'email']);
  });

  it('skips email when the recipient has no email on file', async () => {
    const { listener, email, notifications } = buildListener({ userHasEmail: false });

    await listener.onWorkOrderAssigned(ASSIGNED_EVENT as any);

    expect(email.send).not.toHaveBeenCalled();
    expect(notifications.markSent).toHaveBeenCalledWith('n-1', ['in-app', 'push']);
  });

  it('never throws when an unexpected error occurs in the dispatch flow', async () => {
    const { listener, notifications } = buildListener({});
    notifications.create.mockRejectedValueOnce(new Error('DB down'));

    await expect(listener.onWorkOrderAssigned(ASSIGNED_EVENT as any))
      .resolves.toBeUndefined();
  });
});
