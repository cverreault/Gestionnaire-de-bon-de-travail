import { useMemo, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import SignaturePad from '../../components/SignaturePad';
import { useSession } from '../../stores/session.store';
import { useSyncStore } from '../../sync/sync.store';
import { useLocalWorkOrders, useQueueOps } from '../../sync/useSync';
import { font, radius, spacing, useTheme } from '../../theme/tokens';

type Field = 'signatureClient' | 'signatureTechnician';

/**
 * B61 — « Signatures » tab : every open work order of the technician with
 * its two signatures ; tap to sign (queued like any other mutation). Opened
 * from a work order with `?workOrderId=` it lists that one first.
 */
export default function SignaturesScreen() {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const user = useSession((s) => s.user);
  const enqueueOp = useSyncStore((s) => s.enqueueOp);
  const { rows, loaded } = useLocalWorkOrders();
  const ops = useQueueOps();
  const { workOrderId } = useLocalSearchParams<{ workOrderId?: string }>();
  const [signing, setSigning] = useState<{ id: string; field: Field } | null>(null);
  const lang = i18n.language.startsWith('en') ? 'en-CA' : 'fr-CA';

  const items = useMemo(() => {
    const open = rows.filter((w) => !w.status.startsWith('COMPLETED') && w.status !== 'CANCELLED');
    return workOrderId ? [...open.filter((w) => w.id === workOrderId), ...open.filter((w) => w.id !== workOrderId)] : open;
  }, [rows, workOrderId]);
  const queued = new Set(ops.filter((o) => o.kind === 'signature').map((o) => o.workOrderId));

  async function save(png: string) {
    if (!signing || !user) return;
    const { id, field } = signing;
    setSigning(null);
    await enqueueOp(user.id, id, 'signature', { [field]: png });
  }

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={items}
        keyExtractor={(w) => w.id}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: 40 }}
        ListEmptyComponent={
          <View style={{ padding: spacing.xl, alignItems: 'center' }}>
            <Text style={{ color: theme.textMuted }}>{loaded ? t('signatures.empty') : ''}</Text>
          </View>
        }
        renderItem={({ item: w }) => (
          <View style={{ backgroundColor: theme.surface, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm, borderWidth: 1, borderColor: w.id === workOrderId ? theme.primary : theme.border }}>
            <Text style={{ color: theme.textMuted, fontSize: font.xs }}>{w.referenceNumber}</Text>
            <Text style={{ color: theme.text, fontSize: font.md, fontWeight: '700' }}>{w.title}</Text>
            {w.client && (
              <Text style={{ color: theme.textSecondary, fontSize: font.sm }}>{w.client.companyName || `${w.client.firstName} ${w.client.lastName}`}</Text>
            )}
            {queued.has(w.id) && <Text style={{ color: theme.textMuted, fontSize: font.xs }}>⏳ {t('workOrder.signatureQueued')}</Text>}
            {(['signatureClient', 'signatureTechnician'] as const).map((field) => {
              const signed = field === 'signatureClient' ? w.hasSignatureClient : w.hasSignatureTechnician;
              return (
                <View key={field} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm }}>
                  <Text style={{ color: theme.text, fontSize: font.sm, flex: 1 }}>
                    {t(field === 'signatureClient' ? 'workOrder.signClient' : 'workOrder.signTechnician')} · {signed ? '✅ ' + t('workOrder.signed') : t('workOrder.notSigned')}
                  </Text>
                  <Pressable onPress={() => setSigning({ id: w.id, field })} style={({ pressed }) => ({ paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: theme.primary, opacity: pressed ? 0.6 : 1 })}>
                    <Text style={{ color: theme.primary, fontWeight: '600', fontSize: font.sm }}>✍️ {t('workOrder.signTitle')}</Text>
                  </Pressable>
                </View>
              );
            })}
            {w.signedAt && <Text style={{ color: theme.textMuted, fontSize: font.xs }}>{new Date(w.signedAt).toLocaleString(lang, { dateStyle: 'short', timeStyle: 'short' })}</Text>}
          </View>
        )}
      />
      <SignaturePad
        visible={signing !== null}
        title={t(signing?.field === 'signatureClient' ? 'workOrder.signClient' : 'workOrder.signTechnician')}
        onCancel={() => setSigning(null)}
        onSave={(png) => void save(png)}
      />
    </View>
  );
}
