import { useState } from 'react';
import { ActivityIndicator, Alert, Linking, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  formatAddressLine,
  navigationUrl,
  resolveAvailableTransitions,
  toTelUrl,
  transitionLabel,
  type ProcessSnapshotTransition,
} from '@taskmgr/shared';
import AttachmentsCard from '../../../components/AttachmentsCard';
import SignaturePad from '../../../components/SignaturePad';
import PartsCard from '../../../components/PartsCard';
import StatusBadge from '../../../components/StatusBadge';
import { useSession } from '../../../stores/session.store';
import { useSyncStore } from '../../../sync/sync.store';
import { useLocalWorkOrder } from '../../../sync/useSync';
import { font, radius, spacing, useTheme } from '../../../theme/tokens';

/**
 * Work-order detail (B38.4/B38.5): read from the local database with pending
 * ops projected, transitions resolved from the process snapshot (ADR-016 §7).
 * Every mutation goes through the offline queue and is drained right away
 * when online.
 */
export default function WorkOrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const user = useSession((s) => s.user);
  const { pullNow, online, enqueueOp } = useSyncStore();
  const { wo: w, snapshot, ops, loaded } = useLocalWorkOrder(id);
  const [pending, setPending] = useState<ProcessSnapshotTransition | null>(null);
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [signing, setSigning] = useState<'signatureClient' | 'signatureTechnician' | null>(null);
  const blocked = ops.some((o) => o.status === 'CONFLICT' || (o.status === 'FAILED' && o.kind === 'transition'));
  const pendingIds = new Set(ops.map((o) => o.id));

  const locale: 'fr' | 'en' = i18n.language.startsWith('en') ? 'en' : 'fr';
  const lang = locale === 'en' ? 'en-CA' : 'fr-CA';
  const transitions = resolveAvailableTransitions(snapshot, w?.currentStepId, user?.role ?? 'TECHNICIAN');
  const statusById = new Map((snapshot?.statuses ?? []).map((s) => [s.id, s]));
  const refresh = () => user && void pullNow(user.id);

  async function queueTransition(tr: ProcessSnapshotTransition) {
    if (!user) return;
    await enqueueOp(user.id, id, 'transition', {
      targetStepId: tr.toStatusId,
      label: transitionLabel(tr, locale),
      ...(tr.requiredFields.includes('negativeReason') ? { negativeReason: reason.trim() } : {}),
      ...(tr.requiredFields.includes('completionNotes') ? { completionNotes: reason.trim() } : {}),
    });
    setPending(null);
    setReason('');
  }

  async function queueSignature(field: 'signatureClient' | 'signatureTechnician', png: string) {
    setSigning(null);
    if (!user) return;
    await enqueueOp(user.id, id, 'signature', { [field]: png });
  }

  async function queueNote() {
    if (!user || !note.trim()) return;
    await enqueueOp(user.id, id, 'note', { content: note.trim() });
    setNote('');
  }

  function start(tr: ProcessSnapshotTransition) {
    const needsText = tr.requiredFields.some((f) => f === 'negativeReason' || f === 'completionNotes');
    if (needsText) {
      setPending(tr);
      return;
    }
    Alert.alert(transitionLabel(tr, locale), undefined, [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('workOrder.confirm'), onPress: () => void queueTransition(tr) },
    ]);
  }

  const cardStyle = { backgroundColor: theme.surface, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm, borderWidth: 1, borderColor: theme.border } as const;
  const label = (k: string) => <Text style={{ color: theme.textMuted, fontSize: font.xs, fontWeight: '700', textTransform: 'uppercase' }}>{t(k)}</Text>;

  return (
    <>
      <Stack.Screen options={{ title: w?.referenceNumber ?? '' }} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: 60 }}>
        {!loaded && <ActivityIndicator color={theme.primary} />}
        {loaded && !w && <Text style={{ color: theme.textMuted }}>{t('workOrders.empty')}</Text>}
        {w && (
          <>
            <View style={{ gap: spacing.xs }}>
              <Text style={{ color: theme.textMuted, fontSize: font.sm }}>{w.referenceNumber}</Text>
              <Text style={{ color: theme.text, fontSize: font.xl, fontWeight: '700' }}>{w.title}</Text>
              <StatusBadge status={w.status} step={w.currentStep} />
            </View>

            {(w.client || w.principalClient) && (
              <View style={cardStyle}>
                {label('workOrder.client')}
                {w.client && (
                  <Text style={{ color: theme.text, fontSize: font.md, fontWeight: '600' }}>
                    {w.client.companyName || `${w.client.firstName} ${w.client.lastName}`}
                  </Text>
                )}
                {w.principalClient && (
                  <Text style={{ color: theme.textSecondary, fontSize: font.sm }}>
                    🤝 {t('workOrder.mandatedBy', { name: w.principalClient.companyName || `${w.principalClient.firstName} ${w.principalClient.lastName}` })}
                  </Text>
                )}
                {toTelUrl(w.client?.phone) && (
                  <Pressable onPress={() => void Linking.openURL(toTelUrl(w.client?.phone) as string)}>
                    <Text style={{ color: theme.primary, fontSize: font.md, fontWeight: '600' }}>📞 {t('workOrder.call')} · {w.client?.phone}</Text>
                  </Pressable>
                )}
              </View>
            )}

            {(w.clientAddress_rel || w.clientAddress) && (
              <View style={cardStyle}>
                {label('workOrder.address')}
                <Text style={{ color: theme.text, fontSize: font.md }}>
                  {w.clientAddress_rel ? formatAddressLine(w.clientAddress_rel) : w.clientAddress}
                </Text>
                {w.clientAddress_rel?.label && <Text style={{ color: theme.textMuted, fontSize: font.sm }}>{w.clientAddress_rel.label}</Text>}
                {w.clientAddress_rel?.propertyLandUseLabel && (
                  <Text style={{ color: theme.textMuted, fontSize: font.xs }}>
                    🏠 {[w.clientAddress_rel.propertyLandUseLabel, w.clientAddress_rel.propertyYearBuilt, w.clientAddress_rel.propertyStoreys ? `${w.clientAddress_rel.propertyStoreys} ét.` : null].filter(Boolean).join(' · ')}
                  </Text>
                )}
                {(() => {
                  const url = navigationUrl(
                    { latitude: w.clientAddress_rel?.latitude, longitude: w.clientAddress_rel?.longitude, address: w.clientAddress_rel ? formatAddressLine(w.clientAddress_rel) : w.clientAddress },
                    Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'web',
                  );
                  return url ? (
                    <Pressable onPress={() => void Linking.openURL(url)}>
                      <Text style={{ color: theme.primary, fontSize: font.md, fontWeight: '600' }}>🧭 {t('workOrder.navigate')}</Text>
                    </Pressable>
                  ) : null;
                })()}
              </View>
            )}

            {(w.scheduledDate || w.description) && (
              <View style={cardStyle}>
                {w.scheduledDate && (
                  <Text style={{ color: theme.textSecondary, fontSize: font.sm }}>
                    🗓 {t('workOrder.scheduledAt', { date: new Date(w.scheduledStartTime ?? w.scheduledDate).toLocaleString(lang, { dateStyle: 'medium', timeStyle: w.scheduledStartTime ? 'short' : undefined }) })}
                  </Text>
                )}
                {w.description && <Text style={{ color: theme.text, fontSize: font.sm }}>{w.description}</Text>}
              </View>
            )}

            <View style={cardStyle}>
              {label('workOrder.actions')}
              {!online && <Text style={{ color: theme.textMuted, fontSize: font.xs }}>{t('sync.offline')}</Text>}
              {ops.length > 0 && (
                <Text style={{ color: blocked ? theme.danger : theme.textMuted, fontSize: font.xs }}>
                  {blocked ? t('queue.statusCONFLICT') : t('queue.pending', { count: ops.length })}
                </Text>
              )}
              {transitions.length === 0 && <Text style={{ color: theme.textMuted }}>—</Text>}
              {transitions.map((tr) => (
                <Pressable
                  key={tr.id}
                  disabled={blocked}
                  onPress={() => start(tr)}
                  style={({ pressed }) => ({ backgroundColor: statusById.get(tr.toStatusId)?.color || theme.primary, opacity: pressed || blocked ? 0.6 : 1, padding: spacing.md, borderRadius: radius.md, alignItems: 'center' })}
                >
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: font.md }}>{transitionLabel(tr, locale)}</Text>
                </Pressable>
              ))}
              {pending && (
                <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
                  <Text style={{ color: theme.textSecondary, fontSize: font.sm }}>
                    {pending.requiredFields.includes('negativeReason') ? t('workOrder.reasonLabel') : t('workOrder.completionNotesLabel')}
                  </Text>
                  <TextInput
                    value={reason}
                    onChangeText={setReason}
                    multiline
                    style={{ borderWidth: 1, borderColor: theme.border, borderRadius: radius.md, padding: spacing.md, minHeight: 80, color: theme.text, backgroundColor: theme.surfaceAlt }}
                  />
                  <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                    <Pressable onPress={() => { setPending(null); setReason(''); }} style={{ flex: 1, padding: spacing.md, borderRadius: radius.md, alignItems: 'center', borderWidth: 1, borderColor: theme.border }}>
                      <Text style={{ color: theme.text }}>{t('common.cancel')}</Text>
                    </Pressable>
                    <Pressable
                      disabled={!reason.trim()}
                      onPress={() => void queueTransition(pending)}
                      style={{ flex: 1, padding: spacing.md, borderRadius: radius.md, alignItems: 'center', backgroundColor: theme.primary, opacity: !reason.trim() ? 0.6 : 1 }}
                    >
                      <Text style={{ color: theme.onPrimary, fontWeight: '700' }}>{t('workOrder.confirm')}</Text>
                    </Pressable>
                  </View>
                </View>
              )}
            </View>

            <View style={cardStyle}>
              {label('workOrder.notes')}
              {w.notes.length === 0 && <Text style={{ color: theme.textMuted }}>{t('workOrder.noNotes')}</Text>}
              {w.notes.map((n) => (
                <View key={n.id} style={{ gap: 2, opacity: pendingIds.has(n.id) ? 0.6 : 1 }}>
                  <Text style={{ color: theme.text, fontSize: font.sm }}>{pendingIds.has(n.id) ? '⏳ ' : ''}{n.content}</Text>
                  <Text style={{ color: theme.textMuted, fontSize: font.xs }}>
                    {n.author ? `${n.author.firstName} ${n.author.lastName} · ` : ''}{new Date(n.createdAt).toLocaleString(lang, { dateStyle: 'short', timeStyle: 'short' })}
                  </Text>
                </View>
              ))}
              <TextInput
                value={note}
                onChangeText={setNote}
                placeholder={t('workOrder.notePlaceholder')}
                placeholderTextColor={theme.textMuted}
                multiline
                style={{ borderWidth: 1, borderColor: theme.border, borderRadius: radius.md, padding: spacing.md, minHeight: 64, color: theme.text, backgroundColor: theme.surfaceAlt, marginTop: spacing.xs }}
              />
              <Pressable
                disabled={!note.trim()}
                onPress={() => void queueNote()}
                style={{ padding: spacing.md, borderRadius: radius.md, alignItems: 'center', backgroundColor: theme.primary, opacity: !note.trim() ? 0.6 : 1 }}
              >
                <Text style={{ color: theme.onPrimary, fontWeight: '700' }}>{t('workOrder.addNote')}</Text>
              </Pressable>
            </View>

            <View style={cardStyle}>
              {label('workOrder.signatures')}
              {ops.some((o) => o.kind === 'signature') && <Text style={{ color: theme.textMuted, fontSize: font.xs }}>⏳ {t('workOrder.signatureQueued')}</Text>}
              {(['signatureClient', 'signatureTechnician'] as const).map((field) => {
                const signed = field === 'signatureClient' ? w.hasSignatureClient : w.hasSignatureTechnician;
                return (
                  <View key={field} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm }}>
                    <Text style={{ color: theme.text, fontSize: font.sm }}>
                      {t(field === 'signatureClient' ? 'workOrder.signClient' : 'workOrder.signTechnician')} · {signed ? '✅ ' + t('workOrder.signed') : t('workOrder.notSigned')}
                    </Text>
                    <Pressable onPress={() => setSigning(field)} style={{ paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: theme.primary }}>
                      <Text style={{ color: theme.primary, fontWeight: '600', fontSize: font.sm }}>✍️ {t('workOrder.signTitle')}</Text>
                    </Pressable>
                  </View>
                );
              })}
              {w.signedAt && <Text style={{ color: theme.textMuted, fontSize: font.xs }}>{new Date(w.signedAt).toLocaleString(lang, { dateStyle: 'short', timeStyle: 'short' })}</Text>}
            </View>

            <PartsCard workOrderId={id} parts={w.parts} ops={ops} editable={!w.status.startsWith('COMPLETED')} />

            <AttachmentsCard workOrderId={id} attachments={w.attachments} pendingIds={pendingIds} canUpload onChanged={refresh} />
            <SignaturePad
              visible={signing !== null}
              title={t(signing === 'signatureClient' ? 'workOrder.signClient' : 'workOrder.signTechnician')}
              onCancel={() => setSigning(null)}
              onSave={(png) => signing && void queueSignature(signing, png)}
            />
          </>
        )}
      </ScrollView>
    </>
  );
}
