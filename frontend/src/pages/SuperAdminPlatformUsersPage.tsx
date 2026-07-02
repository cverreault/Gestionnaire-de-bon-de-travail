import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  theme,
  cardStyles,
  layoutStyles,
  buttonStyles,
  formStyles,
} from '../theme';
import {
  createPlatformSuperAdmin,
  listPlatformSuperAdmins,
  type CreatePlatformSuperAdminInput,
  type PlatformSuperAdminRow,
} from '../services/super-admin.service';

/**
 * SA-only — provision new SUPER_ADMIN users from the UI (B7.6).
 *
 * The bootstrap path (SUPER_ADMIN_EMAIL env) stays available but the
 * platform owner should be able to add more platform admins without
 * editing env vars and restarting the backend. New SAs land in the
 * DEFAULT tenant by convention — that's where every SA lives.
 */
export default function SuperAdminPlatformUsersPage() {
  const qc = useQueryClient();

  const { data: list, isLoading } = useQuery({
    queryKey: ['superAdmin', 'platformUsers'],
    queryFn: listPlatformSuperAdmins,
  });

  const [form, setForm] = useState<CreatePlatformSuperAdminInput>({
    email: '',
    password: '',
    firstName: '',
    lastName: '',
    phone: '',
  });

  const create = useMutation({
    mutationFn: () =>
      createPlatformSuperAdmin({
        email: form.email.trim(),
        password: form.password,
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        phone: form.phone?.trim() || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['superAdmin', 'platformUsers'] });
      setForm({ email: '', password: '', firstName: '', lastName: '', phone: '' });
    },
  });

  const canSubmit =
    /^\S+@\S+\.\S+$/.test(form.email.trim()) &&
    form.password.length >= 8 &&
    form.firstName.trim().length > 0 &&
    form.lastName.trim().length > 0;

  const apiError =
    (create.error as { response?: { data?: { message?: string | string[] } } } | undefined)
      ?.response?.data?.message;
  const errorText = Array.isArray(apiError) ? apiError.join(', ') : apiError;

  return (
    <div style={layoutStyles.page}>
      <header style={{ marginBottom: 16 }}>
        <h1 style={{ margin: 0 }}>👑 SUPER_ADMINs de la plateforme</h1>
        <p
          style={{
            color: theme.colors.textMuted,
            margin: '4px 0 0',
            fontSize: 13,
          }}
        >
          Crée et liste les administrateurs globaux. Les SUPER_ADMINs ne sont
          rattachés à aucun tenant — ils peuvent gérer toute la plateforme.
        </p>
      </header>

      {/* ── Création ────────────────────────────────────────────── */}
      <div
        style={{ ...cardStyles.card, padding: 24, maxWidth: 720, marginBottom: 24 }}
      >
        <h3 style={{ margin: '0 0 16px' }}>Nouveau SUPER_ADMIN</h3>

        <div
          style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}
        >
          <Field label="Prénom">
            <input
              value={form.firstName}
              onChange={(e) =>
                setForm({ ...form, firstName: e.target.value })
              }
              style={formStyles.input}
            />
          </Field>
          <Field label="Nom">
            <input
              value={form.lastName}
              onChange={(e) =>
                setForm({ ...form, lastName: e.target.value })
              }
              style={formStyles.input}
            />
          </Field>
        </div>

        <div style={{ marginTop: 12 }}>
          <Field label="Email">
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="admin@plateforme.com"
              style={formStyles.input}
            />
          </Field>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 12,
            marginTop: 12,
          }}
        >
          <Field label="Mot de passe (≥ 8 caractères)">
            <input
              type="password"
              value={form.password}
              onChange={(e) =>
                setForm({ ...form, password: e.target.value })
              }
              placeholder="••••••••"
              style={formStyles.input}
            />
          </Field>
          <Field label="Téléphone (optionnel)">
            <input
              value={form.phone ?? ''}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder="+1 514 555 0123"
              style={formStyles.input}
            />
          </Field>
        </div>

        {errorText && (
          <p
            style={{
              color: theme.colors.danger,
              marginTop: 16,
              fontSize: 13,
            }}
          >
            Échec : {errorText}
          </p>
        )}
        {create.isSuccess && (
          <p
            style={{
              color: theme.colors.success,
              marginTop: 16,
              fontSize: 13,
            }}
          >
            ✅ SUPER_ADMIN créé. Il peut se connecter immédiatement.
          </p>
        )}

        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            marginTop: 16,
          }}
        >
          <button
            onClick={() => create.mutate()}
            disabled={!canSubmit || create.isPending}
            style={{
              ...buttonStyles.primary,
              opacity: !canSubmit || create.isPending ? 0.6 : 1,
              cursor: !canSubmit || create.isPending ? 'not-allowed' : 'pointer',
            }}
          >
            {create.isPending ? 'Création…' : '➕ Créer le SUPER_ADMIN'}
          </button>
        </div>
      </div>

      {/* ── Liste ───────────────────────────────────────────────── */}
      <div style={{ ...cardStyles.card, padding: 0, overflow: 'hidden' }}>
        <div
          style={{
            padding: '12px 16px',
            borderBottom: `1px solid ${theme.colors.border}`,
            fontWeight: 600,
          }}
        >
          SUPER_ADMINs existants ({list?.data.length ?? 0})
        </div>
        {isLoading ? (
          <div style={{ padding: 16, color: theme.colors.textMuted }}>
            Chargement…
          </div>
        ) : !list || list.data.length === 0 ? (
          <div style={{ padding: 16, color: theme.colors.textMuted }}>
            Aucun SUPER_ADMIN.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: theme.colors.surfaceAlt }}>
                <Th>Email</Th>
                <Th>Nom</Th>
                <Th>Téléphone</Th>
                <Th>Actif</Th>
                <Th>Créé le</Th>
              </tr>
            </thead>
            <tbody>
              {list.data.map((u) => (
                <Row key={u.id} u={u} />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span
        style={{
          fontSize: 11,
          color: theme.colors.textMuted,
          textTransform: 'uppercase',
          letterSpacing: 0.5,
        }}
      >
        {label}
      </span>
      {children}
    </label>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th
      style={{
        padding: '10px 12px',
        textAlign: 'left',
        fontSize: 12,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        color: theme.colors.textMuted,
        borderBottom: `1px solid ${theme.colors.border}`,
      }}
    >
      {children}
    </th>
  );
}

function Row({ u }: { u: PlatformSuperAdminRow }) {
  return (
    <tr style={{ borderBottom: `1px solid ${theme.colors.border}` }}>
      <td style={{ padding: '10px 12px', fontSize: 13 }}>{u.email}</td>
      <td style={{ padding: '10px 12px', fontSize: 13 }}>
        {u.firstName} {u.lastName}
      </td>
      <td style={{ padding: '10px 12px', fontSize: 13, color: theme.colors.textMuted }}>
        {u.phone ?? '—'}
      </td>
      <td style={{ padding: '10px 12px', fontSize: 13 }}>
        {u.isActive ? '✅' : '⛔'}
      </td>
      <td style={{ padding: '10px 12px', fontSize: 13, color: theme.colors.textMuted }}>
        {new Date(u.createdAt).toLocaleDateString()}
      </td>
    </tr>
  );
}
