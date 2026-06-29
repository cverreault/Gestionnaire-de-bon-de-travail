import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  listConfigs,
  getConfigValue,
  upsertConfig,
  deleteConfig,
  type ConfigListResponse,
  type ConfigValueResponse,
} from '../services/system-configs.service';
import { theme, cardStyles, layoutStyles, formStyles, buttonStyles } from '../theme';
import { formatDateTime } from '../utils/dateFormat';

/**
 * Super-admin platform configuration page (SA.2.b).
 *
 * SA only — gated by SuperAdminRoute. Lists every key persisted in
 * system_configs + a curated catalog of "known" keys the operator can
 * set even when no row exists yet (so they don't have to know the
 * exact spelling of `vapid.public-key`).
 *
 * Editing flow
 *   1. Click a key → fetch its current resolved value (DB > env)
 *   2. Edit in a form → encrypted toggle (disabled when the backend
 *      reports encryptionAvailable=false)
 *   3. Save → PUT /super-admin/configs/:key + cache invalidation
 *   4. Delete → DELETE /super-admin/configs/:key (env fallback resumes)
 */

const SECTIONS: Array<{ section: string; keys: Array<{ key: string; label: string; encryptedByDefault?: boolean }> }> = [
  {
    section: '📨 Email SMTP',
    keys: [
      { key: 'smtp.host',            label: 'SMTP host (ex: smtp.gmail.com)' },
      { key: 'smtp.port',            label: 'SMTP port (587, 465…)' },
      { key: 'smtp.secure',          label: 'SMTP secure ("true" pour SSL/465, "false" pour STARTTLS/587)' },
      { key: 'smtp.user',            label: 'SMTP username' },
      { key: 'smtp.pass',            label: 'SMTP password / app-password',  encryptedByDefault: true },
      { key: 'notifications.from',   label: 'From address (ex: "TaskMgr <noreply@…>")' },
    ],
  },
  {
    section: '🔔 Web Push (VAPID)',
    keys: [
      { key: 'vapid.public-key',     label: 'VAPID public key' },
      { key: 'vapid.private-key',    label: 'VAPID private key', encryptedByDefault: true },
      { key: 'vapid.subject',        label: 'VAPID subject (mailto:…)' },
    ],
  },
  {
    section: '🐛 Sentry',
    keys: [
      { key: 'sentry.dsn',           label: 'Sentry DSN', encryptedByDefault: true },
      { key: 'sentry.environment',   label: 'Sentry environment (ex: production)' },
      { key: 'sentry.release',       label: 'Sentry release tag' },
    ],
  },
  {
    section: '📦 Audit',
    keys: [
      { key: 'audit.retention-days', label: 'Audit retention (jours, défaut 365)' },
    ],
  },
];

export default function SuperAdminPage() {
  const qc = useQueryClient();
  const { data, isLoading, isError } = useQuery({
    queryKey: ['superAdmin', 'configs', 'list'],
    queryFn: async () => {
      const res = await listConfigs();
      return (res.data?.data ?? res.data) as ConfigListResponse;
    },
    staleTime: 30_000,
  });

  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [editEncrypted, setEditEncrypted] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ msg: string; type: 'ok' | 'err' } | null>(null);

  function flash(msg: string, type: 'ok' | 'err') {
    setStatusMessage({ msg, type });
    setTimeout(() => setStatusMessage(null), 3500);
  }

  async function startEdit(key: string, encryptedByDefault?: boolean) {
    setEditingKey(key);
    setEditError(null);
    setEditValue('');
    setEditEncrypted(encryptedByDefault ?? false);
    try {
      const res = await getConfigValue(key);
      const payload = (res.data?.data ?? res.data) as ConfigValueResponse;
      setEditValue(payload.value);
      setEditEncrypted(payload.encrypted);
    } catch (err) {
      const status = (err as { response?: { status?: number } }).response?.status;
      if (status === 404) {
        // Pas de valeur — l'utilisateur va en créer une. encryptedByDefault s'applique déjà.
      } else {
        setEditError('Impossible de lire la valeur actuelle.');
      }
    }
  }

  function cancelEdit() {
    setEditingKey(null);
    setEditValue('');
    setEditError(null);
  }

  const upsertMutation = useMutation({
    mutationFn: ({ key, value, encrypted }: { key: string; value: string; encrypted: boolean }) =>
      upsertConfig(key, value, encrypted),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['superAdmin', 'configs', 'list'] });
      flash('Configuration enregistrée.', 'ok');
      cancelEdit();
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Erreur lors de l\'enregistrement.';
      setEditError(msg);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (key: string) => deleteConfig(key),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['superAdmin', 'configs', 'list'] });
      flash('Configuration supprimée — le serveur retombe sur la valeur d\'environnement si présente.', 'ok');
      cancelEdit();
    },
    onError: () => flash('Échec de la suppression.', 'err'),
  });

  const persisted = data?.items ?? [];
  const encryptionAvailable = data?.encryptionAvailable ?? false;

  return (
    <div style={{ ...layoutStyles.page }}>
      <div style={{ ...layoutStyles.pageHeader }}>
        <h1 style={{ ...layoutStyles.pageTitle }}>👑 Super-Admin — Configuration plateforme</h1>
        <span style={{ fontSize: theme.font.sizeSm, color: theme.colors.textMuted }}>
          {encryptionAvailable
            ? '🔐 Chiffrement activé'
            : '🔓 Chiffrement indisponible (CONFIG_MASTER_KEY non défini)'}
        </span>
      </div>

      {isLoading && <p style={{ color: theme.colors.textMuted }}>Chargement…</p>}
      {isError && <p style={{ color: theme.colors.danger }}>Erreur de chargement.</p>}

      {statusMessage && (
        <div style={{
          padding: '0.7rem 1rem',
          marginBottom: '1rem',
          borderRadius: theme.radius.md,
          background: statusMessage.type === 'ok' ? (theme.colors.successLight ?? '#dcfce7') : (theme.colors.dangerLight ?? '#fee2e2'),
          color: statusMessage.type === 'ok' ? (theme.colors.success ?? '#15803d') : (theme.colors.danger ?? '#dc2626'),
          border: `1px solid ${statusMessage.type === 'ok' ? '#86efac' : '#fca5a5'}`,
          fontSize: theme.font.sizeSm,
        }}>
          {statusMessage.msg}
        </div>
      )}

      {SECTIONS.map((section) => (
        <div key={section.section} style={{ ...cardStyles.card, marginBottom: '1.25rem' }}>
          <div style={{ ...cardStyles.cardHeader }}>
            <h2 style={{ ...cardStyles.cardTitle }}>{section.section}</h2>
          </div>
          <div style={{ ...cardStyles.cardBody }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: theme.font.sizeSm }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: '0.5rem', color: theme.colors.textMuted, borderBottom: theme.borders.light }}>Clé</th>
                  <th style={{ textAlign: 'left', padding: '0.5rem', color: theme.colors.textMuted, borderBottom: theme.borders.light }}>Statut</th>
                  <th style={{ textAlign: 'right', padding: '0.5rem', color: theme.colors.textMuted, borderBottom: theme.borders.light, width: '180px' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {section.keys.map((meta) => {
                  const persistedRow = persisted.find((p) => p.key === meta.key);
                  const isEditing = editingKey === meta.key;
                  return (
                    <RowAndEditor
                      key={meta.key}
                      label={meta.label}
                      configKey={meta.key}
                      persisted={persistedRow}
                      isEditing={isEditing}
                      editValue={editValue}
                      editEncrypted={editEncrypted}
                      editError={editError}
                      encryptionAvailable={encryptionAvailable}
                      onStartEdit={() => startEdit(meta.key, meta.encryptedByDefault)}
                      onCancel={cancelEdit}
                      onValueChange={setEditValue}
                      onEncryptedChange={setEditEncrypted}
                      onSave={() => upsertMutation.mutate({ key: meta.key, value: editValue, encrypted: editEncrypted })}
                      onDelete={() => deleteMutation.mutate(meta.key)}
                      isSaving={upsertMutation.isPending}
                      isDeleting={deleteMutation.isPending}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {persisted.length > 0 && (
        <div style={{ ...cardStyles.card }}>
          <div style={{ ...cardStyles.cardHeader }}>
            <h2 style={{ ...cardStyles.cardTitle }}>🗂 Autres clés persistées</h2>
          </div>
          <div style={{ ...cardStyles.cardBody }}>
            <p style={{ color: theme.colors.textMuted, fontSize: theme.font.sizeSm, margin: '0 0 0.5rem' }}>
              Clés sauvegardées en base et non listées dans les sections ci-dessus (configurations historiques ou ajoutées manuellement).
            </p>
            <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
              {persisted
                .filter((p) => !SECTIONS.flatMap((s) => s.keys.map((k) => k.key)).includes(p.key))
                .map((p) => (
                  <li key={p.key} style={{ padding: '0.4rem 0', borderBottom: theme.borders.light, fontFamily: 'monospace' }}>
                    {p.key} {p.encrypted && '🔐'} <span style={{ color: theme.colors.textMuted, fontSize: theme.font.sizeXs }}> · maj {formatDateTime(p.updatedAt)}</span>
                  </li>
                ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

interface RowProps {
  label: string;
  configKey: string;
  persisted: { encrypted: boolean; updatedAt: string; updatedBy: string | null } | undefined;
  isEditing: boolean;
  editValue: string;
  editEncrypted: boolean;
  editError: string | null;
  encryptionAvailable: boolean;
  onStartEdit: () => void;
  onCancel: () => void;
  onValueChange: (v: string) => void;
  onEncryptedChange: (v: boolean) => void;
  onSave: () => void;
  onDelete: () => void;
  isSaving: boolean;
  isDeleting: boolean;
}

function RowAndEditor(props: RowProps) {
  const { persisted, isEditing } = props;
  return (
    <>
      <tr style={{ borderBottom: isEditing ? 'none' : theme.borders.light }}>
        <td style={{ padding: '0.5rem' }}>
          <div style={{ fontFamily: 'monospace', fontSize: theme.font.sizeSm }}>{props.configKey}</div>
          <div style={{ fontSize: theme.font.sizeXs, color: theme.colors.textMuted }}>{props.label}</div>
        </td>
        <td style={{ padding: '0.5rem' }}>
          {persisted ? (
            <span style={{ fontSize: theme.font.sizeXs }}>
              <span style={{ background: theme.colors.successLight ?? '#dcfce7', color: theme.colors.success ?? '#15803d', padding: '0.1rem 0.5rem', borderRadius: theme.radius.full }}>
                💾 DB
              </span>
              {persisted.encrypted && (
                <span style={{ marginLeft: '0.4rem', color: theme.colors.textMuted }}>🔐</span>
              )}
              <span style={{ marginLeft: '0.5rem', color: theme.colors.textMuted }}>
                maj {formatDateTime(persisted.updatedAt)}
              </span>
            </span>
          ) : (
            <span style={{ fontSize: theme.font.sizeXs, color: theme.colors.textMuted }}>
              <span style={{ background: theme.colors.surfaceAlt, padding: '0.1rem 0.5rem', borderRadius: theme.radius.full, fontFamily: 'monospace' }}>
                env
              </span>
              <span style={{ marginLeft: '0.5rem' }}>fallback ou non défini</span>
            </span>
          )}
        </td>
        <td style={{ padding: '0.5rem', textAlign: 'right' }}>
          {!isEditing && (
            <button onClick={props.onStartEdit} style={{ ...buttonStyles.secondary, fontSize: theme.font.sizeXs }}>
              ✏️ Modifier
            </button>
          )}
          {!isEditing && persisted && (
            <button
              onClick={props.onDelete}
              disabled={props.isDeleting}
              style={{ ...buttonStyles.secondary, fontSize: theme.font.sizeXs, marginLeft: '0.4rem', color: theme.colors.danger, opacity: props.isDeleting ? 0.6 : 1 }}
            >
              🗑 Supprimer
            </button>
          )}
        </td>
      </tr>
      {isEditing && (
        <tr style={{ borderBottom: theme.borders.light, background: theme.colors.surfaceAlt }}>
          <td colSpan={3} style={{ padding: '0.75rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <textarea
                value={props.editValue}
                onChange={(e) => props.onValueChange(e.target.value)}
                rows={props.editEncrypted ? 1 : 2}
                placeholder="Valeur…"
                style={{
                  ...formStyles.input,
                  fontFamily: 'monospace',
                  fontSize: theme.font.sizeSm,
                  resize: 'vertical',
                  background: theme.colors.surface,
                }}
              />
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: theme.font.sizeSm, color: theme.colors.text }}>
                <input
                  type="checkbox"
                  checked={props.editEncrypted}
                  onChange={(e) => props.onEncryptedChange(e.target.checked)}
                  disabled={!props.encryptionAvailable}
                />
                🔐 Chiffrer cette valeur
                {!props.encryptionAvailable && (
                  <span style={{ color: theme.colors.textMuted, fontSize: theme.font.sizeXs, marginLeft: '0.4rem' }}>
                    (indisponible — CONFIG_MASTER_KEY non défini)
                  </span>
                )}
              </label>
              {props.editError && (
                <p style={{ color: theme.colors.danger, fontSize: theme.font.sizeSm, margin: 0 }}>{props.editError}</p>
              )}
              <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                <button onClick={props.onCancel} style={{ ...buttonStyles.secondary, fontSize: theme.font.sizeSm }}>
                  Annuler
                </button>
                <button
                  onClick={props.onSave}
                  disabled={props.isSaving || !props.editValue}
                  style={{ ...buttonStyles.primary, fontSize: theme.font.sizeSm, opacity: props.isSaving ? 0.6 : 1 }}
                >
                  {props.isSaving ? 'Enregistrement…' : '✓ Enregistrer'}
                </button>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
