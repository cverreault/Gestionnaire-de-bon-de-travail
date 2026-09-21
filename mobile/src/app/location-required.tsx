import { useEffect, useState } from 'react';
import { AppState, Linking, Pressable, Text, View } from 'react-native';
import * as Location from 'expo-location';
import { useTranslation } from 'react-i18next';
import { useSession } from '../stores/session.store';
import { refreshPermissions } from '../gps/useGpsController';
import { useLocationGate } from '../gps/useLocationGate';
import { font, radius, spacing, useTheme } from '../theme/tokens';

/**
 * B46 — blocking screen : the company requires the phone location while the
 * app is used. Stays until the OS permission is granted and location services
 * are on ; the root layout routes back to the app as soon as `ok` flips.
 */
export default function LocationRequiredScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const clearSession = useSession((s) => s.clearSession);
  const { servicesEnabled, permission, recheck } = useLocationGate();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => st === 'active' && void recheck());
    return () => sub.remove();
  }, [recheck]);

  async function allow() {
    setBusy(true);
    try {
      const fg = await Location.requestForegroundPermissionsAsync();
      if (fg.granted) await Location.requestBackgroundPermissionsAsync().catch(() => undefined);
      await refreshPermissions();
      await recheck();
    } finally {
      setBusy(false);
    }
  }

  const button = (label: string, onPress: () => void, primary = false) => (
    <Pressable
      onPress={onPress}
      disabled={busy}
      style={{ padding: spacing.lg, borderRadius: radius.md, alignItems: 'center', backgroundColor: primary ? theme.primary : theme.surface, borderWidth: primary ? 0 : 1, borderColor: theme.border, opacity: busy ? 0.6 : 1 }}
    >
      <Text style={{ color: primary ? theme.onPrimary : theme.text, fontWeight: '700' }}>{label}</Text>
    </Pressable>
  );

  return (
    <View style={{ flex: 1, padding: spacing.xl, gap: spacing.lg, justifyContent: 'center', backgroundColor: theme.background }}>
      <Text style={{ fontSize: 44 }}>📍</Text>
      <Text style={{ color: theme.text, fontSize: font.xl, fontWeight: '700' }}>{t('locationRequired.title')}</Text>
      <Text style={{ color: theme.textSecondary, fontSize: font.md }}>{t('locationRequired.body')}</Text>
      {!servicesEnabled && <Text style={{ color: theme.danger, fontSize: font.sm }}>{t('locationRequired.servicesOff')}</Text>}
      {servicesEnabled && permission === 'denied' && <Text style={{ color: theme.danger, fontSize: font.sm }}>{t('locationRequired.denied')}</Text>}
      {permission !== 'denied' && button(t('locationRequired.allow'), () => void allow(), true)}
      {button(t('locationRequired.openSettings'), () => void Linking.openSettings(), permission === 'denied')}
      {button(t('locationRequired.retry'), () => void recheck())}
      <Pressable onPress={() => void clearSession()} style={{ padding: spacing.md, alignItems: 'center' }}>
        <Text style={{ color: theme.textMuted }}>{t('locationRequired.logout')}</Text>
      </Pressable>
    </View>
  );
}
