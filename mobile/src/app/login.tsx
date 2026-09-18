import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { login, login2fa } from '../api/endpoints';
import { useSession } from '../stores/session.store';
import { font, radius, spacing, useTheme } from '../theme/tokens';

/** Email + password, then the TOTP code when the account has 2FA (B38.3). */
export default function LoginScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const { workspace, setSession, setWorkspace } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  // The 2FA pending token stays in memory only.
  const [pendingToken, setPendingToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inputStyle = {
    borderWidth: 1, borderColor: theme.border, borderRadius: radius.md, padding: spacing.md,
    fontSize: font.md, color: theme.text, backgroundColor: theme.surface,
  } as const;

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      if (pendingToken) {
        const session = await login2fa(pendingToken, code.trim());
        await setSession(session);
      } else {
        const res = await login(email.trim(), password);
        if ('requires2fa' in res) {
          setPendingToken(res.pendingToken);
          return;
        }
        await setSession(res);
      }
      router.replace('/(app)');
    } catch {
      setError(t('login.failed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: theme.background }}>
      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingTop: 80, gap: spacing.md }} keyboardShouldPersistTaps="handled">
        <Text style={{ fontSize: font.xl, fontWeight: '700', color: theme.text }}>{workspace?.name || t('app.name')}</Text>
        <Text style={{ fontSize: font.lg, fontWeight: '600', color: theme.text }}>
          {pendingToken ? t('login.twoFactorTitle') : t('login.title')}
        </Text>

        {pendingToken ? (
          <View style={{ gap: spacing.sm }}>
            <Text style={{ fontSize: font.sm, color: theme.textSecondary }}>{t('login.twoFactorHint')}</Text>
            <TextInput value={code} onChangeText={setCode} keyboardType="number-pad" maxLength={10} autoFocus style={inputStyle} />
          </View>
        ) : (
          <View style={{ gap: spacing.sm }}>
            <Text style={{ fontSize: font.xs, color: theme.textMuted }}>{t('login.email')}</Text>
            <TextInput value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" textContentType="username" style={inputStyle} />
            <Text style={{ fontSize: font.xs, color: theme.textMuted }}>{t('login.password')}</Text>
            <TextInput value={password} onChangeText={setPassword} secureTextEntry textContentType="password" onSubmitEditing={() => void submit()} style={inputStyle} />
          </View>
        )}

        {error && <Text style={{ color: theme.danger, fontSize: font.sm }}>{error}</Text>}

        <Pressable
          onPress={() => void submit()}
          disabled={busy || (pendingToken ? code.trim().length < 6 : !email.trim() || !password)}
          style={({ pressed }) => ({
            backgroundColor: theme.primary, opacity: pressed || busy ? 0.7 : 1,
            padding: spacing.lg, borderRadius: radius.md, alignItems: 'center', marginTop: spacing.sm,
          })}
        >
          <Text style={{ color: theme.onPrimary, fontWeight: '600', fontSize: font.md }}>
            {busy ? t('login.submitting') : pendingToken ? t('login.twoFactorSubmit') : t('login.submit')}
          </Text>
        </Pressable>

        <Pressable onPress={() => { void setWorkspace(null); router.replace('/workspace'); }} style={{ alignItems: 'center', marginTop: spacing.lg }}>
          <Text style={{ color: theme.textMuted, fontSize: font.sm }}>
            {t('workspace.change')} · {workspace?.baseUrl.replace(/^https?:\/\//, '')}
          </Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
