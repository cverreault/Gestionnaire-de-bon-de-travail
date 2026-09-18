import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import '../i18n';
import i18n from '../i18n';
import { useSession } from '../stores/session.store';
import { useUpgradeGate } from '../stores/upgrade.store';
import { useDeviceRegistration } from '../device/useDeviceRegistration';
import { useTheme } from '../theme/tokens';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 60_000, retry: 1, refetchOnWindowFocus: false },
  },
});

/**
 * Root layout (B38.3): providers + navigation gate.
 *   no workspace     → /workspace
 *   no session       → /login
 *   upgrade required → /upgrade-required (heartbeat says this build is too old)
 *   otherwise        → /(app)
 */
export default function RootLayout() {
  const theme = useTheme();
  const { hydrated, hydrate, workspace, accessToken, user } = useSession();
  const upgradeRequired = useUpgradeGate((s) => s.upgradeRequired);
  const segments = useSegments();
  const router = useRouter();
  useDeviceRegistration();

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (!hydrated) return;
    const locale = user?.preferences?.locale;
    if (locale && i18n.language !== locale) void i18n.changeLanguage(locale);
    const top = segments[0];
    if (!workspace) {
      if (top !== 'workspace') router.replace('/workspace');
    } else if (!accessToken) {
      if (top !== 'login' && top !== 'workspace') router.replace('/login');
    } else if (upgradeRequired) {
      if (top !== 'upgrade-required') router.replace('/upgrade-required');
    } else if (top !== '(app)') {
      router.replace('/(app)');
    }
  }, [hydrated, workspace, accessToken, user, upgradeRequired, segments, router]);

  if (!hydrated) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.background }}>
        <ActivityIndicator color={theme.primary} />
      </View>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.background } }} />
    </QueryClientProvider>
  );
}
