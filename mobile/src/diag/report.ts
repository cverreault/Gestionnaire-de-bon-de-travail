import { Platform } from 'react-native';
import * as Application from 'expo-application';
import * as Device from 'expo-device';
import { sendDeviceReport } from '../api/endpoints';
import { db } from '../db/client';
import { getMeta, META } from '../db/repo';
import { countFixes } from '../gps/fixes.repo';
import { useGpsStore } from '../gps/gps.store';
import { usePushStore } from '../push/push.store';
import { useSession } from '../stores/session.store';
import { countOps, listOps } from '../sync/queue';
import { useSyncStore } from '../sync/sync.store';
import { recentEvents } from './log';

/** Snapshot of everything support needs, sent with the recent events. */
export async function buildReport(): Promise<{ state: Record<string, unknown>; events: Record<string, unknown>[] }> {
  const session = useSession.getState();
  const sync = useSyncStore.getState();
  const gps = useGpsStore.getState();
  const push = usePushStore.getState();
  const ops = await listOps(db);
  return {
    state: {
      app: { version: Application.nativeApplicationVersion, build: Application.nativeBuildVersion, platform: Platform.OS, os: String(Platform.Version), model: Device.modelName },
      workspace: session.workspace?.baseUrl,
      user: session.user ? { id: session.user.id, role: session.user.role } : null,
      sync: { online: sync.online, lastSyncAt: await getMeta(db, META.lastSyncAt), cursor: !!(await getMeta(db, META.cursor)), error: sync.error, counts: await countOps(db) },
      queue: ops.map((o) => ({ id: o.id, kind: o.kind, workOrderId: o.workOrderId, status: o.status, attempts: o.attempts, lastError: o.lastError, createdAt: o.createdAt })),
      gps: { consent: gps.serverConsent, fg: gps.foregroundGranted, bg: gps.backgroundGranted, mode: gps.mode, revoked: gps.consentRevoked, buffered: await countFixes(db), lastFlushAt: gps.lastFlushAt, error: gps.error },
      push: { hasToken: !!push.token, permission: push.permission, reason: push.reason },
    },
    events: recentEvents() as unknown as Record<string, unknown>[],
  };
}

export async function sendReport(note?: string): Promise<string> {
  const { deviceId } = useSession.getState();
  const body = await buildReport();
  const res = await sendDeviceReport(deviceId, { ...body, note });
  return res.receivedAt;
}
