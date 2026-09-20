import { useEffect, useMemo, useState } from 'react';
import { Pressable, Switch, Text, TextInput, View } from 'react-native';
import * as Location from 'expo-location';
import { useTranslation } from 'react-i18next';
import type { SyncTemplate, SyncTemplateField } from '@taskmgr/shared';
import { db } from '../db/client';
import { getTemplate } from '../db/repo';
import { useSession } from '../stores/session.store';
import { useSyncStore } from '../sync/sync.store';
import { font, radius, spacing, useTheme } from '../theme/tokens';

interface Props {
  workOrderId: string;
  templateId: string | null | undefined;
  /** Projected values (server + queued). */
  values: Record<string, unknown> | null;
  editable: boolean;
}

const NUMERIC = new Set(['NUMBER', 'INTEGER', 'FLOAT', 'CURRENCY', 'PERCENTAGE']);
const TEXTUAL = new Set(['TEXT', 'EMAIL', 'URL', 'PHONE', 'PHONE_NA', 'POSTAL_CODE_CA']);

function optionsOf(field: SyncTemplateField): { value: string; label: string }[] {
  const raw = field.options;
  if (!Array.isArray(raw)) return [];
  return raw.map((o) => (typeof o === 'string' ? { value: o, label: o } : { value: String((o as { value?: unknown }).value ?? ''), label: String((o as { label?: unknown }).label ?? (o as { value?: unknown }).value ?? '') }));
}

/**
 * Custom form of the task type (B38 follow-up) : sections and fields the
 * technician may see / edit (role lists from the template), values from the
 * projected work order, changes queued as one `template` op.
 */
export default function TemplateFieldsCard({ workOrderId, templateId, values, editable }: Props) {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const user = useSession((s) => s.user);
  const enqueueOp = useSyncStore((s) => s.enqueueOp);
  const version = useSyncStore((s) => s.version);
  const [template, setTemplate] = useState<SyncTemplate | null>(null);
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const role = user?.role ?? 'TECHNICIAN';
  const lang: 'fr' | 'en' = i18n.language.startsWith('en') ? 'en' : 'fr';
  const L = (o: { label?: string; labelFr?: string; labelEn?: string; name?: string; nameFr?: string; nameEn?: string }) =>
    (lang === 'en' ? o.labelEn ?? o.nameEn : o.labelFr ?? o.nameFr) || o.label || o.name || '';

  useEffect(() => {
    let alive = true;
    void getTemplate(db, templateId).then((tpl) => alive && setTemplate(tpl));
    return () => {
      alive = false;
    };
  }, [templateId, version]);

  const sections = useMemo(
    () => (template?.sections ?? []).filter((sec) => sec.viewRoles.includes(role)).map((sec) => ({ ...sec, fields: sec.fields.filter((f) => f.viewRoles.includes(role)) })).filter((sec) => sec.fields.length > 0),
    [template, role],
  );
  const current = (id: string) => (id in draft ? draft[id] : values?.[id]);
  const dirty = Object.keys(draft).some((k) => JSON.stringify(draft[k] ?? null) !== JSON.stringify(values?.[k] ?? null));
  const canEdit = (sec: { editRoles: string[] }, f: SyncTemplateField) => editable && sec.editRoles.includes(role) && f.editRoles.includes(role);

  async function save() {
    if (!user || !dirty) return;
    const patch: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(draft)) if (JSON.stringify(v ?? null) !== JSON.stringify(values?.[k] ?? null)) patch[k] = v ?? null;
    await enqueueOp(user.id, workOrderId, 'template', { templateData: patch });
    setDraft({});
  }

  if (!templateId) return null;

  const inputStyle = { borderWidth: 1, borderColor: theme.border, borderRadius: radius.md, padding: spacing.sm, color: theme.text, backgroundColor: theme.surfaceAlt, fontSize: font.sm } as const;
  const chip = (label: string, active: boolean, onPress: () => void, disabled: boolean) => (
    <Pressable key={label} disabled={disabled} onPress={onPress} style={{ paddingVertical: 5, paddingHorizontal: spacing.md, borderRadius: radius.full, borderWidth: 1, borderColor: active ? theme.primary : theme.border, backgroundColor: active ? `${theme.primary}22` : 'transparent', opacity: disabled ? 0.6 : 1 }}>
      <Text style={{ color: active ? theme.primary : theme.text, fontSize: font.sm }}>{label}</Text>
    </Pressable>
  );

  const renderField = (sec: { editRoles: string[] }, f: SyncTemplateField) => {
    const ro = !canEdit(sec, f);
    const v = current(f.id);
    const set = (nv: unknown) => setDraft((d) => ({ ...d, [f.id]: nv }));
    const required = f.requiredRoles.includes(role);
    let control: React.ReactNode;
    if (f.fieldType === 'CHECKBOX') {
      control = <Switch value={!!v} onValueChange={(nv) => set(nv)} disabled={ro} trackColor={{ true: theme.primary }} />;
    } else if (f.fieldType === 'SELECT' || f.fieldType === 'RADIO') {
      control = <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>{optionsOf(f).map((o) => chip(o.label, v === o.value, () => set(v === o.value ? null : o.value), ro))}</View>;
    } else if (f.fieldType === 'MULTISELECT') {
      const arr = Array.isArray(v) ? (v as string[]) : [];
      control = <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>{optionsOf(f).map((o) => chip(o.label, arr.includes(o.value), () => set(arr.includes(o.value) ? arr.filter((x) => x !== o.value) : [...arr, o.value]), ro))}</View>;
    } else if (f.fieldType === 'GPS') {
      const g = (v && typeof v === 'object' ? (v as { lat?: number; lng?: number }) : null);
      control = (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' }}>
          <Text style={{ color: theme.text, fontSize: font.sm }}>{g?.lat != null && g?.lng != null ? `${g.lat.toFixed(5)}, ${g.lng.toFixed(5)}` : '—'}</Text>
          {!ro && (
            <Pressable
              onPress={() => {
                void (async () => {
                  const perm = await Location.requestForegroundPermissionsAsync();
                  if (!perm.granted) return set({ error: t('form.positionDenied') });
                  const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
                  set({ lat: pos.coords.latitude, lng: pos.coords.longitude });
                })();
              }}
              style={{ paddingVertical: 5, paddingHorizontal: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: theme.primary }}
            >
              <Text style={{ color: theme.primary, fontSize: font.sm, fontWeight: '600' }}>📍 {t('form.useMyPosition')}</Text>
            </Pressable>
          )}
        </View>
      );
    } else {
      const multiline = f.fieldType === 'TEXTAREA';
      const numeric = NUMERIC.has(f.fieldType);
      const hint = f.fieldType === 'DATE' ? t('form.dateHint') : f.fieldType === 'TIME' ? t('form.timeHint') : f.fieldType === 'DATETIME' ? t('form.datetimeHint') : f.placeholder ?? '';
      control = (
        <TextInput
          value={v == null ? '' : String(v)}
          editable={!ro}
          onChangeText={(txt) => set(txt === '' ? null : numeric ? (Number.isNaN(Number(txt.replace(',', '.'))) ? txt : Number(txt.replace(',', '.'))) : txt)}
          placeholder={hint}
          placeholderTextColor={theme.textMuted}
          multiline={multiline}
          keyboardType={numeric ? 'decimal-pad' : f.fieldType === 'EMAIL' ? 'email-address' : f.fieldType === 'URL' ? 'url' : f.fieldType.startsWith('PHONE') ? 'phone-pad' : 'default'}
          autoCapitalize={TEXTUAL.has(f.fieldType) && f.fieldType !== 'TEXT' ? 'none' : 'sentences'}
          style={{ ...inputStyle, minHeight: multiline ? 72 : undefined, opacity: ro ? 0.7 : 1 }}
        />
      );
    }
    return (
      <View key={f.id} style={{ gap: 4 }}>
        <Text style={{ color: theme.textSecondary, fontSize: font.xs, fontWeight: '600' }}>
          {L(f)}{required ? ' *' : ''}{ro ? ` · ${t('form.readOnly')}` : ''}
        </Text>
        {control}
        {f.helpText && <Text style={{ color: theme.textMuted, fontSize: font.xs }}>{f.helpText}</Text>}
      </View>
    );
  };

  return (
    <View style={{ backgroundColor: theme.surface, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md, borderWidth: 1, borderColor: theme.border }}>
      <Text style={{ color: theme.textMuted, fontSize: font.xs, fontWeight: '700', textTransform: 'uppercase' }}>{t('form.title')}{template ? ` · ${L(template)}` : ''}</Text>
      {template && sections.length === 0 && <Text style={{ color: theme.textMuted }}>{t('form.noTemplate')}</Text>}
      {sections.map((sec) => (
        <View key={sec.id} style={{ gap: spacing.sm }}>
          <Text style={{ color: theme.text, fontSize: font.md, fontWeight: '700' }}>{L(sec)}</Text>
          {sec.fields.map((f) => renderField(sec, f))}
        </View>
      ))}
      {editable && sections.length > 0 && (
        <Pressable disabled={!dirty} onPress={() => void save()} style={{ padding: spacing.md, borderRadius: radius.md, alignItems: 'center', backgroundColor: theme.primary, opacity: dirty ? 1 : 0.5 }}>
          <Text style={{ color: theme.onPrimary, fontWeight: '700' }}>{t('form.save')}</Text>
        </Pressable>
      )}
    </View>
  );
}
