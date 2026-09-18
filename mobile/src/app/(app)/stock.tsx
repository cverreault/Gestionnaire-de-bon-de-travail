import { useEffect, useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { db } from '../../db/client';
import { listMyStock, type StockRow } from '../../db/repo';
import { useSession } from '../../stores/session.store';
import { useSyncStore } from '../../sync/sync.store';
import { font, radius, spacing, useTheme } from '../../theme/tokens';

/** « Mon stock » (B38.7) : the technician's truck stock from the local tables (delta pull). */
export default function StockScreen() {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const user = useSession((s) => s.user);
  const { version, syncing, pullNow } = useSyncStore();
  const [rows, setRows] = useState<StockRow[]>([]);
  const lang: 'fr' | 'en' = i18n.language.startsWith('en') ? 'en' : 'fr';

  useEffect(() => {
    let alive = true;
    void listMyStock(db).then((r) => alive && setRows(r));
    return () => {
      alive = false;
    };
  }, [version]);

  return (
    <ScrollView
      contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm, paddingBottom: 40 }}
      refreshControl={<RefreshControl refreshing={syncing} onRefresh={() => user && void pullNow(user.id)} tintColor={theme.primary} />}
    >
      <Text style={{ color: theme.textMuted, fontSize: font.xs }}>{t('stock.hint')}</Text>
      {rows.length === 0 && <Text style={{ color: theme.textMuted, padding: spacing.lg, textAlign: 'center' }}>{t('stock.empty')}</Text>}
      {rows.map((r) => (
        <View key={r.id} style={{ backgroundColor: theme.surface, borderRadius: radius.lg, padding: spacing.lg, flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderWidth: 1, borderColor: theme.border, opacity: r.isActive ? 1 : 0.5 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.text, fontSize: font.md, fontWeight: '600' }}>{(lang === 'en' ? r.nameEn : r.nameFr) || r.nameFr || r.nameEn}</Text>
            <Text style={{ color: theme.textMuted, fontSize: font.xs }}>{r.sku}</Text>
          </View>
          <Text style={{ color: r.quantity > 0 ? theme.text : theme.danger, fontSize: font.lg, fontWeight: '700' }}>{r.quantity} {r.unit}</Text>
        </View>
      ))}
    </ScrollView>
  );
}
