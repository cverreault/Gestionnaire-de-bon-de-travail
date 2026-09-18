import { Linking, Platform, Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { heartbeat } from '../api/endpoints';
import { appVersion } from '../device/device-info';
import { useSession } from '../stores/session.store';
import { useUpgradeGate } from '../stores/upgrade.store';
import { font, radius, spacing, useTheme } from '../theme/tokens';

const STORE_URL = Platform.select({
  ios: 'https://apps.apple.com/app/id0000000000',
  android: 'https://play.google.com/store/apps/details?id=com.dispatch2go.app',
  default: 'https://www.dispatch2go.com',
});

/** Blocking screen when the workspace's minimum app version is newer than this build. */
export default function UpgradeRequiredScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const { minAppVersion, set } = useUpgradeGate();
  const deviceId = useSession((s) => s.deviceId);

  async function recheck() {
    try {
      const res = await heartbeat(deviceId, { appVersion: appVersion() });
      set({ upgradeRequired: res.upgradeRequired, minAppVersion: res.minAppVersion, latestAppVersion: res.latestAppVersion });
    } catch {
      // Still offline: stay here.
    }
  }

  return (
    <View style={{ flex: 1, padding: spacing.xl, gap: spacing.lg, justifyContent: 'center', backgroundColor: theme.background }}>
      <Text style={{ color: theme.text, fontSize: font.xl, fontWeight: '700' }}>{t('upgrade.title')}</Text>
      <Text style={{ color: theme.textSecondary, fontSize: font.md }}>
        {t('upgrade.body', { current: appVersion(), min: minAppVersion ?? '' })}
      </Text>
      <Pressable onPress={() => void Linking.openURL(STORE_URL as string)} style={{ padding: spacing.lg, borderRadius: radius.md, alignItems: 'center', backgroundColor: theme.primary }}>
        <Text style={{ color: theme.onPrimary, fontWeight: '700' }}>{Platform.OS === 'ios' ? 'App Store' : 'Google Play'}</Text>
      </Pressable>
      <Pressable onPress={() => void recheck()} style={{ padding: spacing.md, alignItems: 'center' }}>
        <Text style={{ color: theme.primary, fontWeight: '600' }}>{t('upgrade.retry')}</Text>
      </Pressable>
    </View>
  );
}
