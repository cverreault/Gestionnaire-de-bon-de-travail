import { FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { formatAddressLine, type WorkOrderSummary } from '@taskmgr/shared';
import { fetchMyWorkOrders } from '../../api/endpoints';
import StatusBadge from '../../components/StatusBadge';
import { font, radius, spacing, useTheme } from '../../theme/tokens';

function dayKey(iso: string | null | undefined): 'today' | 'upcoming' | 'unscheduled' {
  if (!iso) return 'unscheduled';
  const d = new Date(iso);
  const now = new Date();
  return d.toDateString() === now.toDateString() || d < now ? 'today' : 'upcoming';
}

/** « Mes BT » — the technician's active work orders (B38.3, online read; sync comes in B38.4). */
export default function WorkOrdersScreen() {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const query = useQuery({ queryKey: ['my-work-orders'], queryFn: fetchMyWorkOrders });
  const items = query.data?.data ?? [];

  type SectionKey = 'today' | 'upcoming' | 'unscheduled';
  const sections = (['today', 'upcoming', 'unscheduled'] as const)
    .map((key: SectionKey) => ({ key, rows: items.filter((w) => dayKey(w.scheduledDate) === key) }))
    .filter((s) => s.rows.length > 0);
  const flat = sections.flatMap((s) => [{ header: s.key } as const, ...s.rows]);

  return (
    <FlatList
      data={flat}
      keyExtractor={(row) => ('header' in row ? `h-${row.header}` : row.id)}
      contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm, paddingBottom: 40 }}
      refreshControl={<RefreshControl refreshing={query.isFetching} onRefresh={() => void query.refetch()} tintColor={theme.primary} />}
      ListHeaderComponent={
        <Text style={{ color: theme.textMuted, fontSize: font.sm, marginBottom: spacing.xs }}>
          {query.isLoading ? t('common.loading') : t('workOrders.count', { count: items.length })}
        </Text>
      }
      ListEmptyComponent={
        query.isLoading ? null : (
          <View style={{ padding: spacing.xl, alignItems: 'center' }}>
            <Text style={{ color: query.isError ? theme.danger : theme.textMuted }}>
              {query.isError ? t('common.error') : t('workOrders.empty')}
            </Text>
            {query.isError && (
              <Pressable onPress={() => void query.refetch()} style={{ marginTop: spacing.md }}>
                <Text style={{ color: theme.primary, fontWeight: '600' }}>{t('common.retry')}</Text>
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
          ? new Date(wo.scheduledStartTime).toLocaleTimeString(i18n.language.startsWith('en') ? 'en-CA' : 'fr-CA', { hour: '2-digit', minute: '2-digit' })
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
