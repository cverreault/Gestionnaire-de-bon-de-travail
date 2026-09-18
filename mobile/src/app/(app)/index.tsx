import { FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { formatAddressLine } from '@taskmgr/shared';
import StatusBadge from '../../components/StatusBadge';
import { useSession } from '../../stores/session.store';
import { useSyncStore } from '../../sync/sync.store';
import { useLocalWorkOrders } from '../../sync/useSync';
import { font, radius, spacing, useTheme } from '../../theme/tokens';

function dayKey(iso: string | null | undefined): 'today' | 'upcoming' | 'unscheduled' {
  if (!iso) return 'unscheduled';
  const d = new Date(iso);
  const now = new Date();
  return d.toDateString() === now.toDateString() || d < now ? 'today' : 'upcoming';
}

const ACTIVE = new Set(['REQUESTED', 'CREATED', 'ASSIGNED', 'DISPATCHED', 'EN_ROUTE', 'IN_PROGRESS']);

/** « Mes BT » — read from the local database, refreshed by the delta pull (B38.4). */
export default function WorkOrdersScreen() {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const user = useSession((s) => s.user);
  const { rows, loaded } = useLocalWorkOrders();
  const { syncing, lastSyncAt, error, online, pullNow } = useSyncStore();
  const lang = i18n.language.startsWith('en') ? 'en-CA' : 'fr-CA';
  const items = rows.filter((w) => ACTIVE.has(w.status));

  type SectionKey = 'today' | 'upcoming' | 'unscheduled';
  const sections = (['today', 'upcoming', 'unscheduled'] as const)
    .map((key: SectionKey) => ({ key, rows: items.filter((w) => dayKey(w.scheduledDate) === key) }))
    .filter((s) => s.rows.length > 0);
  const flat = sections.flatMap((s) => [{ header: s.key } as const, ...s.rows]);

  const syncLine = !online
    ? t('sync.offline')
    : syncing
      ? t('sync.syncing')
      : error
        ? t('sync.failed')
        : lastSyncAt
          ? t('sync.lastSync', { time: new Date(lastSyncAt).toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit' }) })
          : t('sync.never');

  return (
    <FlatList
      data={flat}
      keyExtractor={(row) => ('header' in row ? `h-${row.header}` : row.id)}
      contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm, paddingBottom: 40 }}
      refreshControl={<RefreshControl refreshing={syncing} onRefresh={() => user && void pullNow(user.id)} tintColor={theme.primary} />}
      ListHeaderComponent={
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.xs }}>
          <Text style={{ color: theme.textMuted, fontSize: font.sm }}>{loaded ? t('workOrders.count', { count: items.length }) : t('common.loading')}</Text>
          <Text style={{ color: !online || error ? theme.danger : theme.textMuted, fontSize: font.xs }}>{syncLine}</Text>
        </View>
      }
      ListEmptyComponent={
        !loaded ? null : (
          <View style={{ padding: spacing.xl, alignItems: 'center' }}>
            <Text style={{ color: theme.textMuted }}>{t('workOrders.empty')}</Text>
            {user && (
              <Pressable onPress={() => void pullNow(user.id)} style={{ marginTop: spacing.md }}>
                <Text style={{ color: theme.primary, fontWeight: '600' }}>{t('sync.now')}</Text>
              </Pressable>
            )}
          </View>
        )
      }
      renderItem={({ item }) => {
        if ('header' in item) {
          return (
            <Text style={{ color: theme.textMuted, fontSize: font.xs, fontWeight: '700', textTransform: 'uppercase', marginTop: spacing.md }}>
              {t(`workOrders.${item.header}`)}
            </Text>
          );
        }
        const wo = item;
        const clientName = wo.client ? (wo.client.companyName || `${wo.client.firstName} ${wo.client.lastName}`) : null;
        const address = wo.clientAddress_rel ? formatAddressLine(wo.clientAddress_rel) : wo.clientAddress;
        const time = wo.scheduledStartTime
          ? new Date(wo.scheduledStartTime).toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit' })
          : null;
        return (
          <Pressable
            onPress={() => router.push(`/(app)/work-orders/${wo.id}`)}
            style={({ pressed }) => ({
              backgroundColor: theme.surface, borderRadius: radius.lg, padding: spacing.lg, gap: 6,
              borderWidth: 1, borderColor: theme.border, opacity: pressed ? 0.8 : 1,
            })}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm }}>
              <Text style={{ color: theme.textMuted, fontSize: font.xs }}>{wo.referenceNumber}</Text>
              <StatusBadge status={wo.status} step={wo.currentStep} />
            </View>
            <Text style={{ color: theme.text, fontSize: font.md, fontWeight: '600' }} numberOfLines={2}>{wo.title}</Text>
            {clientName && <Text style={{ color: theme.textSecondary, fontSize: font.sm }}>👤 {clientName}</Text>}
            {address && <Text style={{ color: theme.textSecondary, fontSize: font.sm }} numberOfLines={2}>📍 {address}</Text>}
            {time && <Text style={{ color: theme.textMuted, fontSize: font.xs }}>🕒 {time}</Text>}
          </Pressable>
        );
      }}
    />
  );
}
