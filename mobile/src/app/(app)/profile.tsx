import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import * as Application from 'expo-application';
import { fetchMyDevices, logout, revokeDevice } from '../../api/endpoints';
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
