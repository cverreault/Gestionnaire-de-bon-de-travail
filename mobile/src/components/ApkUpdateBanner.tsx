import { Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useApkUpdate } from '../update/apk-update.store';
import { downloadAndInstallApk } from '../update/useApkUpdate';
import { font, radius, spacing, useTheme } from '../theme/tokens';

/** « Mise à jour disponible » (Android hors store) : télécharge puis ouvre l'installateur. */
export default function ApkUpdateBanner() {
  const { t } = useTranslation();
  const theme = useTheme();
  const { available, progress, error } = useApkUpdate();
  if (!available) return null;
  const mb = available.size ? ` · ${(available.size / 1024 / 1024).toFixed(0)} Mo` : '';
  return (
    <View style={{ backgroundColor: `${theme.primary}18`, borderColor: theme.primary, borderWidth: 1, borderRadius: radius.lg, padding: spacing.md, gap: spacing.xs, marginBottom: spacing.sm }}>
      <Text style={{ color: theme.text, fontWeight: '700', fontSize: font.sm }}>{t('update.available', { version: available.version })}{mb}</Text>
      {available.notes && <Text style={{ color: theme.textSecondary, fontSize: font.xs }}>{available.notes}</Text>}
      {progress !== null ? (
        <Text style={{ color: theme.textSecondary, fontSize: font.sm }}>{t('update.downloading', { pct: Math.round(progress * 100) })}</Text>
      ) : (
        <Pressable onPress={() => void downloadAndInstallApk()} style={{ alignSelf: 'flex-start', paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderRadius: radius.md, backgroundColor: theme.primary }}>
          <Text style={{ color: theme.onPrimary, fontWeight: '700', fontSize: font.sm }}>{t('update.install')}</Text>
        </Pressable>
      )}
      {error && <Text style={{ color: theme.danger, fontSize: font.xs }}>{t('update.failed')} · {error}</Text>}
    </View>
  );
}
