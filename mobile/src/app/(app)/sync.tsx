import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { resolveAvailableTransitions } from '@taskmgr/shared';
import { useEffect, useState } from 'react';
import { db } from '../../db/client';
import { getSnapshot, getWorkOrder } from '../../db/repo';
import { useSession } from '../../stores/session.store';
import { useSyncStore } from '../../sync/sync.store';
import type { AttachmentPayload, NotePayload, PartAddPayload, PartRemovePayload, QueuedOp, SignaturePayload, TransitionPayload } from '../../sync/queue';
import { useQueueOps } from '../../sync/useSync';
import { font, radius, spacing, useTheme } from '../../theme/tokens';

/** Sync screen (B38.5): queue state, conflicts and failures with « apply anyway / retry / discard ». */
export default function SyncScreen() {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const user = useSession((s) => s.user);
  const ops = useQueueOps();
  const { syncing, lastSyncAt, online, error, pullNow, retryOp, discardOp, version, dbReady } = useSyncStore();
  const lang = i18n.language.startsWith('en') ? 'en-CA' : 'fr-CA';
  const [refs, setRefs] = useState<Record<string, { ref: string; stillValid: boolean }>>({});

  // Reference numbers + « is this transition still possible » per op (re-validated against the fresh step).
  useEffect(() => {
    if (!dbReady) return;
    let alive = true;
    void (async () => {
      const out: Record<string, { ref: string; stillValid: boolean }> = {};
      for (const op of ops) {
        const wo = await getWorkOrder(db, op.workOrderId);
        let stillValid = true;
        if (op.kind === 'transition' && wo) {
          const snap = await getSnapshot(db, wo.processDefinitionId);
          const target = (op.payload as TransitionPayload).targetStepId;
          stillValid = resolveAvailableTransitions(snap, wo.currentStepId, user?.role ?? 'TECHNICIAN').some((tr) => tr.toStatusId === target);
        }
        out[op.id] = { ref: wo?.referenceNumber ?? op.workOrderId, stillValid };
      }
      if (alive) setRefs(out);
    })();
    return () => {
      alive = false;
    };
  }, [ops, version, dbReady, user?.role]);

  function describe(op: QueuedOp): string {
    if (op.kind === 'transition') return t('queue.transition', { label: (op.payload as TransitionPayload).label });
    if (op.kind === 'note') return t('queue.note', { text: (op.payload as NotePayload).content.slice(0, 60) });
    if (op.kind === 'signature') {
      const p = op.payload as SignaturePayload;
      return t('queue.signature', { who: p.signatureClient !== undefined ? t('workOrder.signClient') : t('workOrder.signTechnician') });
    }
    if (op.kind === 'part_add') return t('queue.part_add', { qty: (op.payload as PartAddPayload).quantity, sku: (op.payload as PartAddPayload).sku });
    if (op.kind === 'part_remove') return t('queue.part_remove', { sku: (op.payload as PartRemovePayload).sku });
    return t('queue.attachment', { name: (op.payload as AttachmentPayload).name });
  }

  function confirmDiscard(op: QueuedOp) {
    Alert.alert(t('queue.discard'), t('queue.discardConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('queue.discard'), style: 'destructive', onPress: () => void discardOp(op.id) },
    ]);
  }

  const statusColor = (st: QueuedOp['status']) => (st === 'CONFLICT' || st === 'FAILED' ? theme.danger : theme.textMuted);
  const btn = (label: string, onPress: () => void, danger = false) => (
    <Pressable onPress={onPress} style={{ paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: danger ? theme.danger : theme.primary }}>
      <Text style={{ color: danger ? theme.danger : theme.primary, fontWeight: '600', fontSize: font.sm }}>{label}</Text>
    </Pressable>
  );

  return (
    <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: 40 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ color: theme.textMuted, fontSize: font.sm }}>
          {!online ? t('sync.offline') : syncing ? t('sync.syncing') : lastSyncAt ? t('sync.lastSync', { time: new Date(lastSyncAt).toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit' }) }) : t('sync.never')}
        </Text>
        {user && btn(t('sync.now'), () => void pullNow(user.id))}
      </View>
      {error && error !== 'offline' && <Text style={{ color: theme.danger, fontSize: font.sm }}>{t('sync.failed')} · {error}</Text>}
      {error === 'offline' && ops.some((o) => o.status === 'PENDING' && o.attempts > 0) && (
        <Text style={{ color: theme.textSecondary, fontSize: font.sm }}>{t('queue.stopped')}</Text>
      )}
      {ops.length === 0 && <Text style={{ color: theme.textMuted, padding: spacing.lg, textAlign: 'center' }}>{t('queue.empty')}</Text>}
      {ops.map((op) => {
        const info = refs[op.id];
        return (
          <View key={op.id} style={{ backgroundColor: theme.surface, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.xs, borderWidth: 1, borderColor: theme.border }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ color: theme.textMuted, fontSize: font.xs }}>{info?.ref ?? ''}</Text>
              <Text style={{ color: statusColor(op.status), fontSize: font.xs, fontWeight: '700' }}>{t(`queue.status${op.status}`)}</Text>
            </View>
            <Text style={{ color: theme.text, fontSize: font.sm }}>{describe(op)}</Text>
            <Text style={{ color: theme.textMuted, fontSize: font.xs }}>{new Date(op.createdAt).toLocaleString(lang, { dateStyle: 'short', timeStyle: 'short' })}</Text>
            {op.status === 'CONFLICT' && (
              <Text style={{ color: theme.textSecondary, fontSize: font.sm }}>{info && !info.stillValid ? t('queue.unavailableHint') : t('queue.conflictHint')}</Text>
            )}
            {(op.status === 'FAILED' || (op.status === 'PENDING' && op.attempts > 0)) && op.lastError && (
              <Text style={{ color: op.status === 'FAILED' ? theme.danger : theme.textSecondary, fontSize: font.sm }}>
                {op.status === 'PENDING' ? `${t('queue.retryLater')} · ` : ''}{op.lastError}
              </Text>
            )}
            {(op.status === 'CONFLICT' || op.status === 'FAILED') && user && (
              <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs }}>
                {(op.status === 'FAILED' || info?.stillValid !== false) && btn(op.status === 'CONFLICT' ? t('queue.apply') : t('queue.retry'), () => void retryOp(user.id, op.id))}
                {btn(t('queue.discard'), () => confirmDiscard(op), true)}
              </View>
            )}
          </View>
        );
      })}
    </ScrollView>
  );
}
