import { useEffect, useMemo, useState } from 'react';
import { useQueries, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  getConfigValue,
  listConfigs,
  upsertConfig,
  deleteConfig,
  type ConfigListResponse,
  type ConfigValueResponse,
} from '../services/system-configs.service';
import { theme, cardStyles, layoutStyles, formStyles, buttonStyles } from '../theme';
import { toast } from '../context/toast.store';

/**
 * Super-admin platform configuration (B7.6 redesign).
 *
 * Layout : Settings-style page with a vertical tab rail on the left and a
 * single active section panel on the right. Each tab carries a status pill
 * ("Configuré" / "Partiel" / "Désactivé") that reads the live server values
 * so the SA can see at a glance which sections still need attention.
 *
 * Behaviour :
 *   - Values are fetched once via parallel /super-admin/configs/:key calls.
 *   - Edits stay local until the SA hits the sticky footer save button.
 *   - Empty fields → DELETE on save (env fallback resumes).
 *   - Secret fields render as <input type=password> and force encrypted=true.
 *   - Save button is disabled until at least one field in the active section
 *     is dirty (server value vs. local), so accidental saves no-op.
 *   - Toast notifications replace the inline flash banner.
 */

interface ConfigField {
  key: string;
  label: string;
  hint: string;
  placeholder?: string;
  secret?: boolean;
  /** Treat this field as required when checking the section's "Configuré" status. */
  required?: boolean;
}

interface ConfigSection {
  id: string;
  title: string;
  icon: string;
  description: string;
  fields: ConfigField[];
}

const SECTIONS: ConfigSection[] = [
  {
    id: 'smtp',
    title: 'Email SMTP',
    icon: '📨',
    description:
      'Identifiants du serveur sortant pour les notifications par email. Laissez vide pour utiliser la console (mode dev).',
    fields: [
      { key: 'smtp.host', label: 'Hôte SMTP', placeholder: 'smtp.gmail.com', hint: 'Nom de domaine du serveur sortant', required: true },
      { key: 'smtp.port', label: 'Port', placeholder: '587', hint: '587 (STARTTLS) ou 465 (SSL)', required: true },
      { key: 'smtp.secure', label: 'Sécurisé (SSL)', placeholder: 'false', hint: '"true" pour SSL/465, "false" pour STARTTLS/587' },
      { key: 'smtp.user', label: 'Utilisateur', placeholder: 'noreply@taskmgr.com', hint: 'Compte SMTP — souvent l\'adresse d\'envoi', required: true },
      { key: 'smtp.pass', label: 'Mot de passe', placeholder: '••••••••', hint: 'Stocké chiffré. App-password recommandé pour Gmail.', secret: true, required: true },
      { key: 'notifications.from', label: 'Adresse d\'envoi (From)', placeholder: 'TaskMgr <noreply@taskmgr.com>', hint: 'Ce que les destinataires verront comme expéditeur' },
    ],
  },
  {
    id: 'vapid',
    title: 'Web Push (VAPID)',
    icon: '🔔',
    description:
      'Clés VAPID pour les notifications push web. Générez une paire avec `npx web-push generate-vapid-keys`.',
    fields: [
      { key: 'vapid.public-key', label: 'Clé publique VAPID', hint: 'Communiquée au navigateur lors de la souscription', required: true },
      { key: 'vapid.private-key', label: 'Clé privée VAPID', hint: 'Stockée chiffrée. Ne JAMAIS la perdre — pas de récupération.', secret: true, required: true },
      { key: 'vapid.subject', label: 'Subject', placeholder: 'mailto:admin@taskmgr.com', hint: 'Contact technique communiqué aux services de push', required: true },
    ],
  },
  {
    id: 'sentry',
    title: 'Sentry',
    icon: '🐛',
    description:
      'DSN Sentry pour l\'observabilité. Laissez vide pour désactiver la remontée d\'erreurs.',
    fields: [
      { key: 'sentry.dsn', label: 'DSN Sentry', hint: 'URL fournie par votre projet Sentry. Stockée chiffrée.', secret: true, required: true },
      { key: 'sentry.environment', label: 'Environnement', placeholder: 'production', hint: 'Tag d\'environnement pour filtrer dans Sentry' },
      { key: 'sentry.release', label: 'Release', placeholder: 'v2.3.0', hint: 'Version du build pour les sentry-releases' },
    ],
  },
  {
    id: 'audit',
    title: 'Rétention audit',
    icon: '📦',
    description: 'Combien de jours conserver les audit logs avant suppression automatique.',
    fields: [
      { key: 'audit.retention-days', label: 'Jours', placeholder: '365', hint: 'Défaut 365. La purge tourne chaque nuit à 03:30 UTC.', required: true },
    ],
  },
];

const ALL_KEYS = SECTIONS.flatMap((s) => s.fields.map((f) => f.key));

type SectionStatus = 'configured' | 'partial' | 'off';

function statusFor(section: ConfigSection, values: Record<string, string>): SectionStatus {
  const required = section.fields.filter((f) => f.required);
  const filled = (f: ConfigField) => (values[f.key] ?? '').trim().length > 0;
  if (required.every(filled) && required.length > 0) return 'configured';
  if (section.fields.some(filled)) return 'partial';
  return 'off';
}

const STATUS_LABEL_KEY: Record<SectionStatus, string> = {
  configured: 'config.status.configured',
  partial: 'config.status.partial',
  off: 'config.status.off',
};

function statusColor(s: SectionStatus): { fg: string; bg: string } {
  switch (s) {
    case 'configured':
      return { fg: theme.colors.success, bg: theme.colors.successLight };
    case 'partial':
      return { fg: theme.colors.warning, bg: 'rgba(245, 158, 11, 0.15)' };
    case 'off':
      return { fg: theme.colors.textMuted, bg: theme.colors.surfaceAlt };
  }
}

export default function SuperAdminPage() {
  const qc = useQueryClient();
  const { t } = useTranslation('superAdmin');
  const [activeId, setActiveId] = useState<string>(SECTIONS[0].id);
  const [saving, setSaving] = useState(false);

  // Fire one GET per key in parallel — gives us a {key: value} map for the
  // form's initial state. Backend returns `{ value: null, source: 'unset' }`
  // (200) when the key is unset — no error branch needed.
  const queries = useQueries({
    queries: ALL_KEYS.map((key) => ({
      queryKey: ['superAdmin', 'configValue', key],
      queryFn: async () => {
        const res = await getConfigValue(key);
        return (res.data?.data ?? res.data) as ConfigValueResponse;
      },
      staleTime: 60_000,
    })),
  });

  // Server-side snapshot (immutable in the UI — used to compute dirty state)
  // and local edit state. Both are keyed by config key.
  const [serverValues, setServerValues] = useState<Record<string, string>>({});
  const [values, setValues] = useState<Record<string, string>>({});

  useEffect(() => {
    const next: Record<string, string> = {};
    queries.forEach((q, i) => {
      const key = ALL_KEYS[i];
      next[key] = q.data?.value ?? '';
    });
    setServerValues(next);
    // Hydrate local edit state only for keys we haven't touched yet.
    setValues((prev) => {
      const merged: Record<string, string> = { ...next };
      for (const k of Object.keys(prev)) {
        if (k in prev && prev[k] !== undefined) merged[k] = prev[k];
      }
      return merged;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queries.map((q) => q.dataUpdatedAt).join('|')]);

  const activeSection = SECTIONS.find((s) => s.id === activeId) ?? SECTIONS[0];
  const allLoading = queries.every((q) => q.isLoading);

  // A section is dirty when at least one of its fields differs from the
  // server snapshot. Drives the save button's disabled state.
  const isDirty = useMemo(
    () =>
      activeSection.fields.some(
        (f) => (values[f.key] ?? '') !== (serverValues[f.key] ?? ''),
      ),
    [activeSection, values, serverValues],
  );

  async function saveSection(section: ConfigSection) {
    setSaving(true);
    const toUpsert: Array<{ key: string; value: string; secret: boolean }> = [];
    const toDelete: string[] = [];
    for (const field of section.fields) {
      const next = values[field.key] ?? '';
      const before = serverValues[field.key] ?? '';
      if (next === before) continue; // skip untouched fields
      if (next.trim().length === 0) {
        toDelete.push(field.key);
      } else {
        toUpsert.push({ key: field.key, value: next, secret: !!field.secret });
      }
    }
    try {
      await Promise.all([
        ...toUpsert.map((f) => upsertConfig(f.key, f.value, f.secret)),
        ...toDelete.map((k) => deleteConfig(k)),
      ]);
      await qc.invalidateQueries({ queryKey: ['superAdmin', 'configValue'] });
      toast.success(
        t('config.toasts.saved', {
          icon: section.icon,
          title: t(`config.sections.${section.id}.title`),
        }),
      );
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } }).response?.data
          ?.message ?? '';
      toast.error(t('config.toasts.saveFailed', { msg }));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ ...layoutStyles.page, maxWidth: 1100 }}>
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>⚙️</span>
          <span>{t('config.title')}</span>
        </h1>
        <p style={{ color: theme.colors.textMuted, margin: '4px 0 0', fontSize: 13 }}>
          {t('config.subtitle')}
        </p>
      </header>

      {allLoading ? (
        <div style={{ ...cardStyles.card, padding: 32, textAlign: 'center', color: theme.colors.textMuted }}>
          {t('config.loading')}
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '240px 1fr',
            gap: 24,
            alignItems: 'start',
          }}
        >
          {/* ── Tab rail ───────────────────────────────────────────── */}
          <nav
            style={{
              ...cardStyles.card,
              padding: 8,
              position: 'sticky',
              top: 16,
            }}
          >
            {SECTIONS.map((s) => {
              const isActive = s.id === activeId;
              const status = statusFor(s, values);
              const c = statusColor(status);
              return (
                <button
                  key={s.id}
                  onClick={() => setActiveId(s.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    width: '100%',
                    textAlign: 'left',
                    padding: '10px 12px',
                    borderRadius: 6,
                    border: 'none',
                    background: isActive ? theme.colors.surfaceAlt : 'transparent',
                    color: isActive ? theme.colors.text : theme.colors.text,
                    cursor: 'pointer',
                    fontSize: 13,
                    fontWeight: isActive ? 600 : 500,
                    transition: 'background 0.12s ease',
                  }}
                >
                  <span style={{ fontSize: 18 }}>{s.icon}</span>
                  <span style={{ flex: 1 }}>{s.title}</span>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 600,
                      padding: '2px 6px',
                      borderRadius: 999,
                      background: c.bg,
                      color: c.fg,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {status === 'configured' ? '✓' : status === 'partial' ? '◐' : '○'}
                  </span>
                </button>
              );
            })}
          </nav>

          {/* ── Active section panel ──────────────────────────────── */}
          <div style={{ ...cardStyles.card, padding: 0, overflow: 'hidden' }}>
            <div
              style={{
                padding: '20px 24px',
                borderBottom: `1px solid ${theme.colors.border}`,
                background: theme.colors.surfaceAlt,
              }}
            >
              <h2
                style={{
                  margin: 0,
                  fontSize: 18,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                }}
              >
                <span style={{ fontSize: 24 }}>{activeSection.icon}</span>
                <span>{t(`config.sections.${activeSection.id}.title`, activeSection.title)}</span>
                <SectionBadge
                  status={statusFor(activeSection, values)}
                />
              </h2>
              <p
                style={{
                  margin: '6px 0 0 34px',
                  fontSize: 13,
                  color: theme.colors.textMuted,
                }}
              >
                {t(`config.sections.${activeSection.id}.description`, activeSection.description)}
              </p>
            </div>

            <div style={{ padding: 24, display: 'grid', gap: 18 }}>
              {activeSection.fields.map((field) => (
                <FieldRow
                  key={field.key}
                  field={field}
                  value={values[field.key] ?? ''}
                  serverValue={serverValues[field.key] ?? ''}
                  onChange={(v) => setValues({ ...values, [field.key]: v })}
                />
              ))}
            </div>

            {/* ── Sticky save footer ────────────────────────────── */}
            <div
              style={{
                position: 'sticky',
                bottom: 0,
                background: theme.colors.surface,
                borderTop: `1px solid ${theme.colors.border}`,
                padding: '12px 24px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 12,
              }}
            >
              <span style={{ fontSize: 12, color: theme.colors.textMuted }}>
                {isDirty ? t('config.footerDirty') : t('config.footerClean')}
              </span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => {
                    // Reset local edits to the server snapshot.
                    const next: Record<string, string> = {};
                    activeSection.fields.forEach((f) => {
                      next[f.key] = serverValues[f.key] ?? '';
                    });
                    setValues((prev) => ({ ...prev, ...next }));
                  }}
                  disabled={!isDirty || saving}
                  style={{
                    ...buttonStyles.secondary,
                    opacity: !isDirty || saving ? 0.5 : 1,
                    cursor: !isDirty || saving ? 'not-allowed' : 'pointer',
                  }}
                >
                  {t('config.cancel')}
                </button>
                <button
                  onClick={() => saveSection(activeSection)}
                  disabled={!isDirty || saving}
                  style={{
                    ...buttonStyles.primary,
                    opacity: !isDirty || saving ? 0.5 : 1,
                    cursor: !isDirty || saving ? 'not-allowed' : 'pointer',
                  }}
                >
                  {saving ? t('config.saving') : t('config.save')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SectionBadge({ status }: { status: SectionStatus }) {
  const { t } = useTranslation('superAdmin');
  const c = statusColor(status);
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 600,
        padding: '3px 8px',
        borderRadius: 999,
        background: c.bg,
        color: c.fg,
        marginLeft: 4,
      }}
    >
      {t(STATUS_LABEL_KEY[status])}
    </span>
  );
}

function FieldRow({
  field,
  value,
  serverValue,
  onChange,
}: {
  field: ConfigField;
  value: string;
  serverValue: string;
  onChange: (v: string) => void;
}) {
  const { t } = useTranslation('superAdmin');
  const dirty = value !== serverValue;
  return (
    <label style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 16, alignItems: 'start' }}>
      <div style={{ paddingTop: 7 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: theme.colors.text, display: 'flex', alignItems: 'center', gap: 6 }}>
          {field.label}
          {field.secret && (
            <span title="Stocké chiffré" style={{ color: theme.colors.warning }}>
              🔐
            </span>
          )}
          {field.required && (
            <span title="Champ requis pour activer cette section" style={{ color: theme.colors.danger, fontSize: 11 }}>
              ●
            </span>
          )}
        </div>
        <div style={{ fontSize: 11, color: theme.colors.textMuted, marginTop: 2 }}>
          {field.hint}
        </div>
      </div>
      <div style={{ position: 'relative' }}>
        <input
          type={field.secret ? 'password' : 'text'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          autoComplete="off"
          style={{
            ...formStyles.input,
            paddingRight: dirty ? 80 : undefined,
            borderColor: dirty ? theme.colors.warning : theme.colors.border,
          }}
        />
        {dirty && (
          <span
            style={{
              position: 'absolute',
              right: 10,
              top: '50%',
              transform: 'translateY(-50%)',
              fontSize: 10,
              fontWeight: 600,
              padding: '2px 6px',
              borderRadius: 4,
              background: 'rgba(245, 158, 11, 0.15)',
              color: theme.colors.warning,
              pointerEvents: 'none',
            }}
          >
            {t('config.modifiedTag')}
          </span>
        )}
      </div>
    </label>
  );
}

// Keep the import surface stable for downstream tooling.
void listConfigs as ((...args: unknown[]) => unknown) | undefined;
void ({} as ConfigListResponse | undefined);
