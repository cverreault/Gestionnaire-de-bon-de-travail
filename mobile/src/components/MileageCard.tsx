import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import * as Location from 'expo-location';
import { useTranslation } from 'react-i18next';
import { computeTravelFromHere } from '../api/endpoints';
import { useSyncStore } from '../sync/sync.store';
import { font, radius, spacing, useTheme } from '../theme/tokens';

/**
 * B49 — « Kilométrage depuis ma position » : the technician picks one way or
 * round trip ; the phone position is sent to the routing engine and the result
 * is stored on the work order (visible to dispatch). Needs network.
 */
export default function MileageCard({ workOrderId, cardStyle }: { workOrderId: string; cardStyle: object }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const online = useSyncStore((s) => s.online);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ distanceKm: number; durationMin: number; roundTrip: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(roundTrip: boolean) {
    setBusy(true);
    setError(null);
    try {
      const perm = await Location.getForegroundPermissionsAsync();
      if (!perm.granted) throw new Error(t('mileage.noPermission'));
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const res = await computeTravelFromHere(workOrderId, { lat: pos.coords.latitude, lng: pos.coords.longitude }, roundTrip);
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const button = (label: string, roundTrip: boolean) => (
    <Pressable
      onPress={() => void run(roundTrip)}
      disabled={busy || !online}
      style={{ flex: 1, padding: spacing.md, borderRadius: radius.md, alignItems: 'center', backgroundColor: theme.surfaceAlt ?? theme.surface, borderWidth: 1, borderColor: theme.border, opacity: busy || !online ? 0.5 : 1 }}
    >
      <Text style={{ color: theme.primary, fontWeight: '600', fontSize: font.sm }}>{label}</Text>
    </Pressable>
  );

  return (
    <View style={cardStyle as object}>
      <Text style={{ color: theme.textMuted, fontSize: font.xs, textTransform: 'uppercase', fontWeight: '700' }}>{t('mileage.title')}</Text>
      <Text style={{ color: theme.textSecondary, fontSize: font.xs }}>{t('mileage.explain')}</Text>
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        {button(t('mileage.oneWay'), false)}
        {button(t('mileage.roundTrip'), true)}
      </View>
      {!online && <Text style={{ color: theme.textMuted, fontSize: font.xs }}>{t('sync.offline')}</Text>}
      {busy && <Text style={{ color: theme.textMuted, fontSize: font.sm }}>{t('mileage.computing')}</Text>}
      {result && (
        <Text style={{ color: theme.text, fontSize: font.md, fontWeight: '600' }}>
          🚗 {t('mileage.result', { km: result.distanceKm, min: Math.round(result.durationMin), mode: result.roundTrip ? t('mileage.roundTrip') : t('mileage.oneWay') })}
        </Text>
      )}
      {error && <Text style={{ color: theme.danger, fontSize: font.sm }}>{error}</Text>}
    </View>
  );
}
