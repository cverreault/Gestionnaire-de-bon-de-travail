import { Alert, Linking, Pressable, ScrollView, Switch, Text, View } from 'react-native';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import * as Application from 'expo-application';
import { fetchMyDevices, logout, revokeDevice, updateMyPreferences } from '../../api/endpoints';
import { useGpsStore } from '../../gps/gps.store';
import { refreshPermissions } from '../../gps/useGpsController';
import { useSession } from '../../stores/session.store';
import { font, radius, spacing, useTheme } from '../../theme/tokens';

export default function ProfileScreen() {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const qc = useQueryClient();
  const { user, workspace, deviceId, clearSession } = useSession();
  const lang = i18n.language.startsWith('en') ? 'en-CA' : 'fr-CA';
  const devices = useQuery({ queryKey: ['my-devices'], queryFn: fetchMyDevices });
  const revoke = useMutation({
    mutationFn: (id: string) => revokeDevice(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['my-devices'] }),
  });

  const gps = useGpsStore();
  const setSession = useSession((s) => s.setSession);
  const { accessToken, refreshToken } = useSession();

  async function toggleGps(enabled: boolean) {
    if (!user || !accessToken || !refreshToken) return;
    if (enabled) {
      const fg = await Location.requestForegroundPermissionsAsync();
      if (fg.granted) await Location.requestBackgroundPermissionsAsync();
      await refreshPermissions();
    }
    await updateMyPreferences({ gps: { enabled } });
    const preferences = { ...(user.preferences ?? {}), gps: { enabled } };
    await setSession({ accessToken, refreshToken, user: { ...user, preferences } });
    gps.set({ serverConsent: enabled, consentRevoked: false, error: null });
  }

  function confirmRevoke(id: string) {
    Alert.alert(t('profile.revoke'), t('profile.revokeConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('profile.revoke'), style: 'destructive', onPress: () => revoke.mutate(id) },
    ]);
  }

  function confirmLogout() {
    Alert.alert(t('profile.logout'), t('profile.logoutConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('profile.logout'),
        style: 'destructive',
        onPress: () => {
          void (async () => {
            await logout();
            await clearSession();
            qc.clear();
            router.replace('/login');
          })();
        },
      },
    ]);
  }

  const row = (k: string, v: string | null | undefined) => (
    <View style={{ gap: 2 }}>
      <Text style={{ color: theme.textMuted, fontSize: font.xs, textTransform: 'uppercase', fontWeight: '700' }}>{t(k)}</Text>
      <Text style={{ color: theme.text, fontSize: font.sm }} selectable>{v || '—'}</Text>
    </View>
  );

  return (
    <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
      <View style={{ backgroundColor: theme.surface, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md, borderWidth: 1, borderColor: theme.border }}>
        <Text style={{ color: theme.text, fontSize: font.xl, fontWeight: '700' }}>
          {user ? `${user.firstName} ${user.lastName}` : ''}
        </Text>
        <Text style={{ color: theme.textSecondary, fontSize: font.sm }}>{user?.email} · {user?.role}</Text>
        {row('profile.workspace', workspace ? `${workspace.name || ''} ${workspace.baseUrl}`.trim() : null)}
        {row('profile.device', deviceId)}
        {row('profile.version', `${Application.nativeApplicationVersion ?? '0.0.0'} (${Application.nativeBuildVersion ?? '-'})`)}
      </View>
      {user?.role === 'TECHNICIAN' && (
        <View style={{ backgroundColor: theme.surface, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm, borderWidth: 1, borderColor: theme.border }}>
          <Text style={{ color: theme.textMuted, fontSize: font.xs, textTransform: 'uppercase', fontWeight: '700' }}>{t('gps.title')}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <Text style={{ flex: 1, color: theme.text, fontSize: font.sm }}>{t('gps.toggle')}</Text>
            <Switch value={gps.serverConsent} onValueChange={(v) => void toggleGps(v)} trackColor={{ true: theme.primary }} />
          </View>
          <Text style={{ color: theme.textMuted, fontSize: font.xs }}>{t('gps.explain')}</Text>
          <Text style={{ color: gps.mode === 'off' ? theme.textMuted : theme.success ?? theme.primary, fontSize: font.sm, fontWeight: '600' }}>{t(`gps.mode${gps.mode}`)}</Text>
          {gps.serverConsent && !gps.foregroundGranted && (
            <Pressable onPress={() => void Linking.openSettings()}>
              <Text style={{ color: theme.danger, fontSize: font.sm }}>{t('gps.permissionMissing')} <Text style={{ color: theme.primary, fontWeight: '600' }}>{t('gps.openSettings')}</Text></Text>
            </Pressable>
          )}
          {gps.consentRevoked && <Text style={{ color: theme.danger, fontSize: font.sm }}>{t('gps.revoked')}</Text>}
          {gps.buffered > 0 && <Text style={{ color: theme.textMuted, fontSize: font.xs }}>{t('gps.buffered', { count: gps.buffered })}</Text>}
          {gps.lastFlushAt && <Text style={{ color: theme.textMuted, fontSize: font.xs }}>{t('gps.lastFlush', { time: new Date(gps.lastFlushAt).toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit' }) })}</Text>}
        </View>
      )}
      {devices.data && devices.data.length > 0 && (
        <View style={{ backgroundColor: theme.surface, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md, borderWidth: 1, borderColor: theme.border }}>
          <Text style={{ color: theme.textMuted, fontSize: font.xs, textTransform: 'uppercase', fontWeight: '700' }}>{t('profile.devices')}</Text>
          {devices.data.map((d) => (
            <View key={d.installationId} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ color: theme.text, fontSize: font.sm, fontWeight: '600' }}>
                  {d.platform === 'IOS' ? '' : '🤖'} {d.model ?? d.platform} · {d.appVersion}{d.installationId === deviceId ? ` (${t('profile.thisDevice')})` : ''}
                </Text>
                <Text style={{ color: theme.textMuted, fontSize: font.xs }}>
                  {t('profile.lastSeen', { date: new Date(d.lastSeenAt).toLocaleString(lang, { dateStyle: 'short', timeStyle: 'short' }) })}
                </Text>
              </View>
              {d.installationId !== deviceId && (
                <Pressable onPress={() => confirmRevoke(d.installationId)} disabled={revoke.isPending}>
                  <Text style={{ color: theme.danger, fontWeight: '600', fontSize: font.sm }}>{t('profile.revoke')}</Text>
                </Pressable>
              )}
            </View>
          ))}
        </View>
      )}
      <Pressable
        onPress={confirmLogout}
        style={({ pressed }) => ({ padding: spacing.lg, borderRadius: radius.md, alignItems: 'center', borderWidth: 1, borderColor: theme.danger, opacity: pressed ? 0.7 : 1 })}
      >
        <Text style={{ color: theme.danger, fontWeight: '700' }}>{t('profile.logout')}</Text>
      </Pressable>
    </ScrollView>
  );
}
