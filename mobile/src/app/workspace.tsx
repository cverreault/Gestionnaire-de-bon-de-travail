import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { fetchBranding } from '../api/endpoints';
import BarcodeScanner from '../components/BarcodeScanner';
import { useSession } from '../stores/session.store';
import { font, radius, spacing, useTheme } from '../theme/tokens';

const DEFAULT_URL = 'https://www.dispatch2go.com';

function normalizeUrl(raw: string): string | null {
  let v = raw.trim();
  if (!v) return null;
  if (!/^https?:\/\//i.test(v)) v = `https://${v}`;
  try {
    const u = new URL(v);
    return `${u.protocol}//${u.host}`;
  } catch {
    return null;
  }
}

/** First screen: which Dispatch2Go server (ADR-014 §3). */
export default function WorkspaceScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const { workspace, setWorkspace } = useSession();
  const [url, setUrl] = useState(workspace?.baseUrl ?? DEFAULT_URL);
  const [state, setState] = useState<'idle' | 'checking' | 'error'>('idle');
  const [scanning, setScanning] = useState(false);

  async function submit(candidate?: string) {
    const base = normalizeUrl(candidate ?? url);
    if (!base) {
      setState('error');
      return;
    }
    setState('checking');
    try {
      const branding = await fetchBranding(base);
      await setWorkspace({ baseUrl: base, name: branding.name, slug: branding.slug, logoUrl: branding.logoUrl });
      router.replace('/login');
    } catch {
      setState('error');
    }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: theme.background }}>
      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingTop: 80, gap: spacing.md }}>
        <Text style={{ fontSize: font.xl, fontWeight: '700', color: theme.text }}>{t('app.name')}</Text>
        <Text style={{ fontSize: font.lg, fontWeight: '600', color: theme.text }}>{t('workspace.title')}</Text>
        <Text style={{ fontSize: font.sm, color: theme.textSecondary }}>{t('workspace.subtitle')}</Text>
        <Text style={{ fontSize: font.xs, color: theme.textMuted, marginTop: spacing.md }}>{t('workspace.urlLabel')}</Text>
        <TextInput
          value={url}
          onChangeText={(v) => { setUrl(v); setState('idle'); }}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          placeholder={t('workspace.urlPlaceholder')}
          placeholderTextColor={theme.textMuted}
          onSubmitEditing={() => void submit()}
          style={{
            borderWidth: 1, borderColor: state === 'error' ? theme.danger : theme.border, borderRadius: radius.md,
            padding: spacing.md, fontSize: font.md, color: theme.text, backgroundColor: theme.surface,
          }}
        />
        {state === 'error' && <Text style={{ color: theme.danger, fontSize: font.sm }}>{t('workspace.invalid')}</Text>}
        <Pressable onPress={() => setScanning(true)} style={{ alignSelf: 'flex-start', paddingVertical: spacing.sm }}>
          <Text style={{ color: theme.primary, fontWeight: '600', fontSize: font.sm }}>📷 {t('workspace.scan')}</Text>
        </Pressable>
        <BarcodeScanner
          visible={scanning}
          onCancel={() => setScanning(false)}
          onScanned={(value) => {
            setScanning(false);
            setUrl(value);
            void submit(value);
          }}
        />
        <Pressable
          onPress={() => void submit()}
          disabled={state === 'checking'}
          style={({ pressed }) => ({
            backgroundColor: theme.primary, opacity: pressed || state === 'checking' ? 0.7 : 1,
            padding: spacing.lg, borderRadius: radius.md, alignItems: 'center', marginTop: spacing.md,
          })}
        >
          <Text style={{ color: theme.onPrimary, fontWeight: '600', fontSize: font.md }}>
            {state === 'checking' ? t('workspace.checking') : t('workspace.connect')}
          </Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
