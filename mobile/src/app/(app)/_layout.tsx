import { Tabs } from 'expo-router';
import { Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSyncStore } from '../../sync/sync.store';
import { useTheme } from '../../theme/tokens';

/** Authenticated area: bottom tabs (work orders, sync queue with badge, profile ; stock comes with B38.7). */
export default function AppLayout() {
  const { t } = useTranslation();
  const theme = useTheme();
  const counts = useSyncStore((s) => s.counts);
  const badge = counts.pending + counts.failed + counts.conflict;
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: theme.surface },
        headerTitleStyle: { color: theme.text },
        headerTintColor: theme.primary,
        tabBarStyle: { backgroundColor: theme.surface, borderTopColor: theme.border },
        tabBarActiveTintColor: theme.primary,
        tabBarInactiveTintColor: theme.textMuted,
        sceneStyle: { backgroundColor: theme.background },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: t('tabs.workOrders'), tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 18 }}>🧾</Text> }}
      />
      <Tabs.Screen
        name="work-orders/[id]"
        options={{ href: null, title: '' }}
      />
      <Tabs.Screen
        name="sync"
        options={{
          title: t('tabs.sync'),
          tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 18 }}>🔄</Text>,
          tabBarBadge: badge > 0 ? badge : undefined,
          tabBarBadgeStyle: { backgroundColor: counts.failed + counts.conflict > 0 ? theme.danger : theme.primary },
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: t('tabs.profile'), tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 18 }}>👤</Text> }}
      />
    </Tabs>
  );
}
