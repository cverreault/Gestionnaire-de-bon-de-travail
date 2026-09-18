import { useEffect, useState } from 'react';
import { Alert, Pressable, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { SyncWorkOrderPart } from '@taskmgr/shared';
import { db } from '../db/client';
import { findCatalogBySku, searchCatalog, type CatalogRow } from '../db/repo';
import { useSession } from '../stores/session.store';
import { useSyncStore } from '../sync/sync.store';
import type { QueuedOp } from '../sync/queue';
import { font, radius, spacing, useTheme } from '../theme/tokens';
import BarcodeScanner from './BarcodeScanner';

interface Props {
  workOrderId: string;
  parts: SyncWorkOrderPart[];
  ops: QueuedOp[];
  /** Terminal work orders refuse part changes server-side ; hide the controls. */
  editable: boolean;
}

/** Parts used on a work order (B38.7) : local catalog search or barcode scan, queued add / remove. */
export default function PartsCard({ workOrderId, parts, ops, editable }: Props) {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const user = useSession((s) => s.user);
  const { enqueueOp, discardOp } = useSyncStore();
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CatalogRow[]>([]);
  const [picked, setPicked] = useState<CatalogRow | null>(null);
  const [qty, setQty] = useState('1');
  const [source, setSource] = useState<'TECHNICIAN_STOCK' | 'WAREHOUSE'>('TECHNICIAN_STOCK');
  const [scanning, setScanning] = useState(false);
  const [scanMiss, setScanMiss] = useState(false);
  const lang: 'fr' | 'en' = i18n.language.startsWith('en') ? 'en' : 'fr';
  const name = (r: { nameFr: string; nameEn: string }) => (lang === 'en' ? r.nameEn : r.nameFr) || r.nameFr || r.nameEn;
  const pendingIds = new Set(ops.map((o) => o.id));

  useEffect(() => {
    if (!adding || picked) return;
    let alive = true;
    void searchCatalog(db, query).then((rows) => alive && setResults(rows));
    return () => {
      alive = false;
    };
  }, [adding, query, picked]);

  async function confirmAdd() {
    if (!user || !picked) return;
    const quantity = Math.max(1, Math.floor(Number(qty) || 1));
    await enqueueOp(user.id, workOrderId, 'part_add', { partId: picked.id, quantity, source, sku: picked.sku, name: name(picked), unit: picked.unit });
    setAdding(false);
    setPicked(null);
    setQuery('');
    setQty('1');
  }

  async function onScanned(value: string) {
    setScanning(false);
    const row = await findCatalogBySku(db, value);
    if (!row) {
      setScanMiss(true);
      setQuery(value);
      return;
    }
    setScanMiss(false);
    setPicked(row);
  }

  function remove(row: SyncWorkOrderPart) {
    if (!user) return;
    Alert.alert(t('workOrder.removePart'), t('workOrder.removePartConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('workOrder.removePart'),
        style: 'destructive',
        onPress: () => {
          // A queued addition that never left the phone is simply dropped.
          if (pendingIds.has(row.id)) void discardOp(row.id);
          else void enqueueOp(user.id, workOrderId, 'part_remove', { rowId: row.id, sku: row.sku });
        },
      },
    ]);
  }

  const chip = (label: string, active: boolean, onPress: () => void) => (
    <Pressable onPress={onPress} style={{ paddingVertical: 6, paddingHorizontal: spacing.md, borderRadius: radius.full, borderWidth: 1, borderColor: active ? theme.primary : theme.border, backgroundColor: active ? `${theme.primary}22` : 'transparent' }}>
      <Text style={{ color: active ? theme.primary : theme.text, fontSize: font.sm, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );

  return (
    <View style={{ backgroundColor: theme.surface, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm, borderWidth: 1, borderColor: theme.border }}>
      <Text style={{ color: theme.textMuted, fontSize: font.xs, fontWeight: '700', textTransform: 'uppercase' }}>{t('workOrder.parts')}</Text>
      {parts.length === 0 && <Text style={{ color: theme.textMuted }}>{t('workOrder.noParts')}</Text>}
      {parts.map((row) => (
        <View key={row.id} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, opacity: pendingIds.has(row.id) ? 0.6 : 1 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.text, fontSize: font.sm, fontWeight: '600' }}>{pendingIds.has(row.id) ? '⏳ ' : ''}{row.quantity} {row.unit} × {name(row)}</Text>
            <Text style={{ color: theme.textMuted, fontSize: font.xs }}>{row.sku} · {row.source === 'WAREHOUSE' ? t('workOrder.fromWarehouse') : t('workOrder.fromTruck')}</Text>
          </View>
          {editable && (
            <Pressable onPress={() => remove(row)}>
              <Text style={{ color: theme.danger, fontSize: font.sm, fontWeight: '600' }}>{t('workOrder.removePart')}</Text>
            </Pressable>
          )}
        </View>
      ))}

      {editable && !adding && (
        <Pressable onPress={() => setAdding(true)} style={{ padding: spacing.md, borderRadius: radius.md, alignItems: 'center', borderWidth: 1, borderColor: theme.primary }}>
          <Text style={{ color: theme.primary, fontWeight: '700' }}>＋ {t('workOrder.addPart')}</Text>
        </Pressable>
      )}

      {editable && adding && (
        <View style={{ gap: spacing.sm, marginTop: spacing.xs }}>
          {!picked && (
            <>
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                <TextInput
                  value={query}
                  onChangeText={(v) => { setQuery(v); setScanMiss(false); }}
                  placeholder={t('workOrder.partSearch')}
                  placeholderTextColor={theme.textMuted}
                  autoCapitalize="characters"
                  style={{ flex: 1, borderWidth: 1, borderColor: theme.border, borderRadius: radius.md, padding: spacing.md, color: theme.text, backgroundColor: theme.surfaceAlt }}
                />
                <Pressable onPress={() => setScanning(true)} style={{ paddingHorizontal: spacing.md, justifyContent: 'center', borderRadius: radius.md, borderWidth: 1, borderColor: theme.border }}>
                  <Text style={{ color: theme.text }}>📷 {t('workOrder.scan')}</Text>
                </Pressable>
              </View>
              {scanMiss && <Text style={{ color: theme.danger, fontSize: font.sm }}>{t('workOrder.noMatch')}</Text>}
              {results.slice(0, 8).map((r) => (
                <Pressable key={r.id} onPress={() => setPicked(r)} style={{ paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: theme.border }}>
                  <Text style={{ color: theme.text, fontSize: font.sm, fontWeight: '600' }}>{r.sku}</Text>
                  <Text style={{ color: theme.textSecondary, fontSize: font.xs }}>{name(r)} · {r.unit}</Text>
                </Pressable>
              ))}
              {results.length === 0 && query.trim() !== '' && !scanMiss && <Text style={{ color: theme.textMuted, fontSize: font.sm }}>{t('workOrder.noMatch')}</Text>}
            </>
          )}
          {picked && (
            <>
              <Text style={{ color: theme.text, fontSize: font.md, fontWeight: '600' }}>{picked.sku} · {name(picked)}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                <Text style={{ color: theme.textSecondary, fontSize: font.sm }}>{t('workOrder.partQty')}</Text>
                <TextInput value={qty} onChangeText={setQty} keyboardType="number-pad" style={{ width: 72, borderWidth: 1, borderColor: theme.border, borderRadius: radius.md, padding: spacing.sm, color: theme.text, backgroundColor: theme.surfaceAlt, textAlign: 'center' }} />
                <Text style={{ color: theme.textMuted, fontSize: font.sm }}>{picked.unit}</Text>
              </View>
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                {chip(t('workOrder.fromTruck'), source === 'TECHNICIAN_STOCK', () => setSource('TECHNICIAN_STOCK'))}
                {chip(t('workOrder.fromWarehouse'), source === 'WAREHOUSE', () => setSource('WAREHOUSE'))}
              </View>
            </>
          )}
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <Pressable onPress={() => { setAdding(false); setPicked(null); setQuery(''); }} style={{ flex: 1, padding: spacing.md, borderRadius: radius.md, alignItems: 'center', borderWidth: 1, borderColor: theme.border }}>
              <Text style={{ color: theme.text }}>{t('common.cancel')}</Text>
            </Pressable>
            {picked && (
              <Pressable onPress={() => void confirmAdd()} style={{ flex: 1, padding: spacing.md, borderRadius: radius.md, alignItems: 'center', backgroundColor: theme.primary }}>
                <Text style={{ color: theme.onPrimary, fontWeight: '700' }}>{t('workOrder.addPart')}</Text>
              </Pressable>
            )}
          </View>
        </View>
      )}
      <BarcodeScanner visible={scanning} onScanned={(v) => void onScanned(v)} onCancel={() => setScanning(false)} />
    </View>
  );
}
