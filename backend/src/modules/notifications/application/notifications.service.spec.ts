/**
 * QA — notifications.service.spec.ts
 */

import { NotFoundException } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { NOTIFICATION_EVENT_NAMES } from '../domain/events/notification-events';

interface NotificationRow {
  id: string;
  userId: string;
  type: string;
  title: string;
  body: string | null;
  aggregateId: string | null;
  data: unknown;
  status: string;
  channelsSent: unknown;
  sentAt: Date | null;
  readAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

let counter = 0;

interface MockUserRow {
  id: string;
  preferences: Record<string, unknown> | null;
}

function makeMockPrisma(seed: NotificationRow[] = [], users: MockUserRow[] = []) {
  const rows: NotificationRow[] = [...seed];

  return {
    _rows: rows,
    _users: users,
    user: {
      findUnique: jest.fn(({ where, select: _s }: { where: { id: string }; select: unknown }) =>
        Promise.resolve(users.find((u) => u.id === where.id) ?? null),
      ),
      update: jest.fn(({ where, data }: { where: { id: string }; data: Partial<MockUserRow> }) => {
        const u = users.find((x) => x.id === where.id);
        if (!u) return Promise.reject(new Error('not found'));
        if (data.preferences !== undefined) u.preferences = data.preferences as Record<string, unknown>;
        return Promise.resolve(u);
      }),
    },
    notification: {
      create: jest.fn(({ data }: { data: Partial<NotificationRow> }) => {
        counter++;
        const row: NotificationRow = {
          id: 'n-' + counter,
          userId: data.userId!,
          type: data.type!,
          title: data.title!,
          body: data.body ?? null,
          aggregateId: data.aggregateId ?? null,
          data: data.data ?? null,
          status: 'PENDING',
          channelsSent: null,
          sentAt: null,
          readAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        rows.push(row);
        return Promise.resolve(row);
      }),
      findUnique: jest.fn(({ where }: { where: { id: string } }) =>
        Promise.resolve(rows.find((r) => r.id === where.id) ?? null),
      ),
      findMany: jest.fn(({ where, take }: { where: any; take?: number }) => {
        let filtered = rows.filter((r) => r.userId === where.userId);
        if (where.readAt === null) filtered = filtered.filter((r) => r.readAt === null);
        filtered.sort((a, b) => {
          // unread first (readAt null < non-null), then createdAt DESC
          if ((a.readAt === null) !== (b.readAt === null)) {
            return a.readAt === null ? -1 : 1;
          }
          return b.createdAt.getTime() - a.createdAt.getTime();
        });
        return Promise.resolve(take ? filtered.slice(0, take) : filtered);
      }),
      count: jest.fn(({ where }: { where: any }) => {
        let filtered = rows.filter((r) => r.userId === where.userId);
        if (where.readAt === null) filtered = filtered.filter((r) => r.readAt === null);
        return Promise.resolve(filtered.length);
      }),
      update: jest.fn(({ where, data }: { where: { id: string }; data: Partial<NotificationRow> }) => {
        const row = rows.find((r) => r.id === where.id);
        if (!row) return Promise.reject(new Error('not found'));
        Object.assign(row, data);
        return Promise.resolve(row);
      }),
      updateMany: jest.fn(({ where, data }: { where: any; data: Partial<NotificationRow> }) => {
        let touched = 0;
        for (const r of rows) {
          if (r.userId === where.userId && (where.readAt === null ? r.readAt === null : true)) {
            Object.assign(r, data);
            touched++;
          }
        }
        return Promise.resolve({ count: touched });
      }),
    },
    $transaction: jest.fn((ops: Array<Promise<unknown>>) => Promise.all(ops)),
  };
}

function makeMockEmitter() {
  return { emit: jest.fn() } as any;
}

function buildSvc(prisma: any, emitter = makeMockEmitter()) {
  return new NotificationsService(prisma as any, emitter as any);
}

describe('NotificationsService', () => {
  beforeEach(() => { counter = 0; });

  // ── create ────────────────────────────────────────────────────────────────

  it('create() persists a row with default PENDING status', async () => {
    const prisma = makeMockPrisma();
    const svc = buildSvc(prisma);

    const row = await svc.create({
      userId: 'u-1',
      type: 'workOrder.assigned',
      title: 'Nouveau BT',
      aggregateId: 'wo-1',
    });

    expect(row.status).toBe('PENDING');
    expect(prisma._rows).toHaveLength(1);
    expect(prisma._rows[0]).toMatchObject({
      userId: 'u-1',
      type: 'workOrder.assigned',
      aggregateId: 'wo-1',
    });
  });

  // ── markSent ──────────────────────────────────────────────────────────────

  it('markSent() updates status, channelsSent, sentAt, and emits notification.sent', async () => {
    const prisma = makeMockPrisma();
    const emitter = makeMockEmitter();
    const svc = buildSvc(prisma, emitter);

    const row = await svc.create({ userId: 'u-1', type: 'workOrder.assigned', title: 'x' });
    await svc.markSent(row.id, ['email', 'push']);

    expect(prisma._rows[0].status).toBe('SENT');
    expect(prisma._rows[0].channelsSent).toEqual(['email', 'push']);
    expect(prisma._rows[0].sentAt).toBeInstanceOf(Date);

    expect(emitter.emit).toHaveBeenCalledTimes(1);
    const [name, payload] = (emitter.emit as jest.Mock).mock.calls[0];
    expect(name).toBe(NOTIFICATION_EVENT_NAMES.SENT);
    expect(payload).toMatchObject({
      name: NOTIFICATION_EVENT_NAMES.SENT,
      aggregateId: row.id,
      data: { userId: 'u-1', type: 'workOrder.assigned', channels: ['email', 'push'] },
    });
  });

  // ── findForUser ───────────────────────────────────────────────────────────

  it('findForUser() returns unread first, then newest, with unreadCount', async () => {
    const prisma = makeMockPrisma();
    const svc = buildSvc(prisma);

    const oldRead = await svc.create({ userId: 'u-1', type: 't', title: 'old read' });
    await svc.markRead(oldRead.id, 'u-1');
    await svc.create({ userId: 'u-1', type: 't', title: 'newer unread' });
    await svc.create({ userId: 'u-2', type: 't', title: 'someone else' });

    const result = await svc.findForUser('u-1');
    expect(result.items).toHaveLength(2);
    expect(result.items[0].title).toBe('newer unread'); // unread first
    expect(result.items[0].readAt).toBeNull();
    expect(result.items[1].title).toBe('old read');
    expect(result.unreadCount).toBe(1);
  });

  it('findForUser({unreadOnly}) filters out read rows', async () => {
    const prisma = makeMockPrisma();
    const svc = buildSvc(prisma);

    const a = await svc.create({ userId: 'u-1', type: 't', title: 'a' });
    await svc.markRead(a.id, 'u-1');
    await svc.create({ userId: 'u-1', type: 't', title: 'b' });

    const result = await svc.findForUser('u-1', { unreadOnly: true });
    expect(result.items).toHaveLength(1);
    expect(result.items[0].title).toBe('b');
  });

  // ── markRead ──────────────────────────────────────────────────────────────

  it('markRead() sets readAt', async () => {
    const prisma = makeMockPrisma();
    const svc = buildSvc(prisma);
    const row = await svc.create({ userId: 'u-1', type: 't', title: 'x' });

    const updated = await svc.markRead(row.id, 'u-1');

    expect(updated.readAt).toBeInstanceOf(Date);
  });

  it('markRead() is idempotent — second call does not move readAt', async () => {
    const prisma = makeMockPrisma();
    const svc = buildSvc(prisma);
    const row = await svc.create({ userId: 'u-1', type: 't', title: 'x' });

    const first = await svc.markRead(row.id, 'u-1');
    const second = await svc.markRead(row.id, 'u-1');

    expect(first.readAt).toEqual(second.readAt);
  });

  it('markRead() throws 404 when the notification belongs to another user (object-level RBAC)', async () => {
    const prisma = makeMockPrisma();
    const svc = buildSvc(prisma);
    const row = await svc.create({ userId: 'u-1', type: 't', title: 'x' });

    await expect(svc.markRead(row.id, 'u-attacker')).rejects.toThrow(NotFoundException);
  });

  it('markRead() throws 404 when the notification does not exist', async () => {
    const prisma = makeMockPrisma();
    const svc = buildSvc(prisma);

    await expect(svc.markRead('does-not-exist', 'u-1')).rejects.toThrow(NotFoundException);
  });

  // ── markAllRead ───────────────────────────────────────────────────────────

  it('markAllRead() flips every unread row for the user only', async () => {
    const prisma = makeMockPrisma();
    const svc = buildSvc(prisma);
    await svc.create({ userId: 'u-1', type: 't', title: 'a' });
    await svc.create({ userId: 'u-1', type: 't', title: 'b' });
    await svc.create({ userId: 'u-2', type: 't', title: 'c' });

    const { marked } = await svc.markAllRead('u-1');
    expect(marked).toBe(2);

    expect(prisma._rows.filter((r) => r.userId === 'u-1' && r.readAt !== null)).toHaveLength(2);
    expect(prisma._rows.filter((r) => r.userId === 'u-2' && r.readAt !== null)).toHaveLength(0);
  });

  // ── Preferences (B1.2) ────────────────────────────────────────────────────

  it('getPreferences() returns defaults when nothing is stored', async () => {
    const prisma = makeMockPrisma([], [{ id: 'u-1', preferences: null }]);
    const svc = buildSvc(prisma);

    const prefs = await svc.getPreferences('u-1');

    expect(prefs['workOrder.assigned']).toEqual({ inApp: true, email: true });
    expect(prefs['workOrder.completed']).toEqual({ inApp: true, email: false });
  });

  it('getPreferences() merges stored overrides on top of defaults', async () => {
    const prisma = makeMockPrisma([], [
      {
        id: 'u-1',
        preferences: {
          theme: 'dark', // unrelated preference, must be ignored
          notifications: {
            'workOrder.assigned': { email: false }, // partial override
          },
        },
      },
    ]);
    const svc = buildSvc(prisma);

    const prefs = await svc.getPreferences('u-1');

    expect(prefs['workOrder.assigned']).toEqual({ inApp: true, email: false });
    expect(prefs['workOrder.completed']).toEqual({ inApp: true, email: false });
  });

  it('updatePreferences() shallow-merges and preserves unrelated preferences keys', async () => {
    const prisma = makeMockPrisma([], [
      { id: 'u-1', preferences: { theme: 'dark' } },
    ]);
    const svc = buildSvc(prisma);

    const merged = await svc.updatePreferences('u-1', {
      'workOrder.assigned': { email: false },
    });

    // Returned value reflects the merged result.
    expect(merged['workOrder.assigned']).toEqual({ inApp: true, email: false });
    expect(merged['workOrder.completed']).toEqual({ inApp: true, email: false });

    // Persisted user row keeps unrelated keys and stores the sparse patch.
    const stored = prisma._users[0].preferences as any;
    expect(stored.theme).toBe('dark');
    expect(stored.notifications).toEqual({
      'workOrder.assigned': { email: false },
    });
  });

  it('updatePreferences() merges with existing notification entries', async () => {
    const prisma = makeMockPrisma([], [
      {
        id: 'u-1',
        preferences: {
          notifications: {
            'workOrder.assigned': { email: false },
          },
        },
      },
    ]);
    const svc = buildSvc(prisma);

    await svc.updatePreferences('u-1', {
      'workOrder.assigned': { inApp: false },
    });

    const stored = prisma._users[0].preferences as any;
    // Both keys preserved on the same event.
    expect(stored.notifications['workOrder.assigned']).toEqual({ inApp: false, email: false });
  });
});
