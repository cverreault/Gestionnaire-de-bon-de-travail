import { useEffect, useState } from 'react';
import { useQueries, useQueryClient } from '@tanstack/react-query';
import {
  getConfigValue,
  listConfigs,
  upsertConfig,
  deleteConfig,
  type ConfigListResponse,
  type ConfigValueResponse,
} from '../services/system-configs.service';
import { theme, cardStyles, layoutStyles, formStyles, buttonStyles } from '../theme';

/**
 * Super-admin platform configuration (refonte — formulaire structuré).
 *
 * Approach :
 *   - 4 sections (SMTP / VAPID / Sentry / Audit), each a card.
 *   - Every field is visible immediately with its current value pre-
 *     populated from the server (one /super-admin/configs/:key call
 *     per known key, fired in parallel via useQueries).
 *   - "💾 Enregistrer cette section" button per card. Only the
 *     changed keys are PUT to the backend.
 *   - Empty (or whitespace) → DELETE so the env fallback resumes.
 *   - Secret fields (smtp.pass / vapid.private-key / sentry.dsn) are
 *     rendered as <input type=password> + the "encrypted" flag is
 *     forced ON when saving (no toggle to forget).
 */

interface ConfigField {
  key: string;
  label: string;
  hint: string;
  placeholder?: string;
  secret?: boolean;
  multiline?: boolean;
}

interface ConfigSection {
  title: string;
  description: string;
  fields: ConfigField[];
}

const SECTIONS: ConfigSection[] = [
  {
    title: '📨 Email SMTP',
    description:
      'Identifiants de votre serveur SMTP pour l\'envoi de notifications. Laissez vide pour utiliser la console (dev).',
    fields: [
      { key: 'smtp.host', label: 'Hôte SMTP', placeholder: 'smtp.gmail.com', hint: 'Nom de domaine du serveur sortant' },
      { key: 'smtp.port', label: 'Port', placeholder: '587', hint: '587 (STARTTLS) ou 465 (SSL)' },
      { key: 'smtp.secure', label: 'Sécurisé (SSL)', placeholder: 'false', hint: '"true" pour SSL/465, "false" pour STARTTLS/587' },
      { key: 'smtp.user', label: 'Utilisateur', placeholder: 'noreply@taskmgr.com', hint: 'Compte SMTP — souvent l\'adresse email d\'envoi' },
      { key: 'smtp.pass', label: 'Mot de passe', placeholder: '••••••••', hint: 'Stocké chiffré. App-password recommandé pour Gmail.', secret: true },
      { key: 'notifications.from', label: 'Adresse d\'envoi (From)', placeholder: 'TaskMgr <noreply@taskmgr.com>', hint: 'Ce que les destinataires verront comme expéditeur' },
    ],
  },
  {
    title: '🔔 Web Push (VAPID)',
    description:
      'Clés VAPID pour les notifications push web. Générez une paire avec `npx web-push generate-vapid-keys`.',
    fields: [
      { key: 'vapid.public-key', label: 'Clé publique VAPID', hint: 'Communiquée au navigateur lors de la souscription' },
      { key: 'vapid.private-key', label: 'Clé privée VAPID', hint: 'Stockée chiffrée. Ne JAMAIS la perdre — pas de récupération.', secret: true },
      { key: 'vapid.subject', label: 'Subject', placeholder: 'mailto:admin@taskmgr.com', hint: 'Contact technique communiqué aux services de push' },
    ],
  },
  {
    title: '🐛 Sentry',
    description:
      'DSN Sentry pour l\'observabilité. Laissez vide pour désactiver la remontée d\'erreurs.',
    fields: [
      { key: 'sentry.dsn', label: 'DSN Sentry', hint: 'URL fournie par votre projet Sentry. Stockée chiffrée.', secret: true },
      { key: 'sentry.environment', label: 'Environnement', placeholder: 'production', hint: 'Tag d\'environnement pour filtrer dans Sentry' },
      { key: 'sentry.release', label: 'Release', placeholder: 'v2.3.0', hint: 'Version du build pour les sentry-releases' },
    ],
  },
  {
    title: '📦 Rétention audit',
    description: 'Combien de jours conservez-vous les audit logs avant suppression.',
    fields: [
      { key: 'audit.retention-days', label: 'Jours', placeholder: '365', hint: 'Défaut 365. La purge tourne chaque nuit à 03:30 UTC.' },
    ],
  },
];

const ALL_KEYS = SECTIONS.flatMap((s) => s.fields.map((f) => f.key));

export default function SuperAdminPage() {
  const qc = useQueryClient();
  const [flash, setFlash] = useState<{ msg: string; ok: boolean } | null>(null);

  // Fire one GET per key in parallel — gives us a {key: value} map
  // for the form's initial state.
  const queries = useQueries({
    queries: ALL_KEYS.map((key) => ({
      queryKey: ['superAdmin', 'configValue', key],
      queryFn: async () => {
        try {
          const res = await getConfigValue(key);
          return (res.data?.data ?? res.data) as ConfigValueResponse;
        } catch (err: unknown) {
          const status = (err as { response?: { status?: number } }).response?.status;
          if (status === 404) return null;
          throw err;
        }
      },
      staleTime: 60_000,
    })),
  });

  // Local edit state — keyed by config key.
  const [values, setValues] = useState<Record<string, string>>({});

  // Hydrate values from the server fetches when they land.
  useEffect(() => {
    const next: Record<string, string> = {};
    queries.forEach((q, i) => {
      const key = ALL_KEYS[i];
      if (q.data) {
        next[key] = q.data.value;
      } else if (values[key] === undefined) {
        next[key] = '';
      } else {
        next[key] = values[key];
      }
    });
    // Only commit changes if the server-side fetches added new info.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setValues((prev) => ({ ...next, ...prev }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queries.map((q) => q.dataUpdatedAt).join('|')]);

  async function saveSection(section: ConfigSection) {
    const toUpsert: Array<{ key: string; value: string; secret: boolean }> = [];
    const toDelete: string[] = [];
    for (const field of section.fields) {
      const next = values[field.key] ?? '';
      if (next.trim().length === 0) {
        // Empty → delete the row so the env fallback resumes.
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
      qc.invalidateQueries({ queryKey: ['superAdmin', 'configValue'] });
      setFlash({ msg: `✓ ${section.title} enregistré`, ok: true });
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } }).response?.data
          ?.message ?? 'Erreur inconnue';
      setFlash({ msg: `✗ Échec : ${msg}`, ok: false });
    }
    window.setTimeout(() => setFlash(null), 4000);
  }

  return (
    <div style={layoutStyles.page}>
      <header style={{ marginBottom: 16 }}>
        <h1 style={{ margin: 0 }}>👑 Configuration plateforme</h1>
        <p style={{ color: theme.colors.textMuted, margin: '4px 0 0', fontSize: 13 }}>
          Réglages globaux de TaskMgr. Laissez un champ vide pour utiliser la variable d'environnement ou la valeur par défaut.
        </p>
      </header>

      {flash && (
        <div
          role="alert"
          style={{
            padding: '8px 12px',
            borderRadius: 4,
            marginBottom: 12,
            background: flash.ok ? theme.colors.successLight : theme.colors.dangerLight,
            color: flash.ok ? theme.colors.success : theme.colors.danger,
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          {flash.msg}
        </div>
      )}

      {SECTIONS.map((section) => (
        <section key={section.title} style={{ ...cardStyles.card, padding: 20, marginBottom: 16 }}>
          <h2 style={{ margin: '0 0 4px', fontSize: 16 }}>{section.title}</h2>
          <p style={{ margin: '0 0 16px', color: theme.colors.textMuted, fontSize: 12 }}>
            {section.description}
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {section.fields.map((field) => (
              <FieldRow
                key={field.key}
                field={field}
                value={values[field.key] ?? ''}
                onChange={(v) => setValues({ ...values, [field.key]: v })}
              />
            ))}
          </div>

          <button
            onClick={() => saveSection(section)}
            style={{ ...buttonStyles.primary, marginTop: 16 }}
          >
            💾 Enregistrer cette section
          </button>
        </section>
      ))}
    </div>
  );
}

function FieldRow({
  field,
  value,
  onChange,
}: {
  field: ConfigField;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 12, color: theme.colors.text, fontWeight: 600 }}>
        {field.label}
        {field.secret && (
          <span title="Stocké chiffré" style={{ marginLeft: 6, color: theme.colors.warning }}>
            🔐
          </span>
        )}
      </span>
      <input
        type={field.secret ? 'password' : 'text'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={field.placeholder}
        autoComplete="off"
        style={formStyles.input}
      />
      <span style={{ fontSize: 11, color: theme.colors.textMuted }}>
        {field.hint}
      </span>
    </label>
  );
}
