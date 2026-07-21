import { useState, FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery } from '@tanstack/react-query';
import { theme, cardStyles, layoutStyles, buttonStyles, formStyles } from '../theme';
import {
  searchUsers,
  impersonate,
  type UserSearchRow,
} from '../services/super-admin.service';
import { useAuthStore } from '../context/auth.store';
import { Role } from '../types';

/**
 * Cross-tenant user search (B7).
 *
 * SA types an email prefix → backend returns up to 50 matches across
 * all tenants. Each row offers "Entrer dans cet espace" which kicks
 * off the impersonation handoff via the same flow as the Tenants
 * page (auto-pick the 1st ADMIN of the row's tenant).
 */
export default function SuperAdminUsersPage() {
  const { t } = useTranslation('superAdmin');
  const [input, setInput] = useState('');
  const [submitted, setSubmitted] = useState<string | null>(null);

  const { data, isFetching } = useQuery({
    queryKey: ['superAdmin', 'users', submitted],
    queryFn: () => searchUsers(submitted ?? ''),
    enabled: !!submitted && submitted.length >= 2,
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(input.trim());
  };

  return (
    <div style={layoutStyles.page}>
      <header style={{ marginBottom: 16 }}>
        <h1 style={{ margin: 0 }}>🔍 {t('superAdmin:usersPage.title', { defaultValue: 'Recherche utilisateur cross-tenant' })}</h1>
        <p style={{ color: theme.colors.textMuted, margin: '4px 0 0', fontSize: 13 }}>
          {t('superAdmin:usersPage.subtitle', { defaultValue: 'Tape un email (ou un préfixe) — résultats à travers tous les tenants.' })}
        </p>
      </header>

      <form
        onSubmit={submit}
        style={{ ...cardStyles.card, padding: 16, marginBottom: 16, display: 'flex', gap: 8 }}
      >
        <input
          autoFocus
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={t('superAdmin:usersPage.searchPlaceholder', { defaultValue: 'ex: jean@…' })}
          style={{ ...formStyles.input, flex: 1 }}
        />
        <button type="submit" style={buttonStyles.primary} disabled={input.trim().length < 2}>
          {t('superAdmin:usersPage.search', { defaultValue: 'Rechercher' })}
        </button>
      </form>

      {isFetching && <p>{t('superAdmin:usersPage.searching', { defaultValue: 'Recherche…' })}</p>}

      {data && (
        <div style={{ ...cardStyles.card, padding: 0, overflow: 'hidden' }}>
          {data.length === 0 ? (
            <p style={{ padding: 16, color: theme.colors.textMuted }}>
              {t('superAdmin:usersPage.noResults', { defaultValue: 'Aucun utilisateur ne correspond à « {{query}} ».', query: submitted })}
            </p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead style={{ background: theme.colors.surfaceAlt }}>
                <tr>
                  <th style={th}>{t('superAdmin:usersPage.colEmail', { defaultValue: 'Email' })}</th>
                  <th style={th}>{t('superAdmin:usersPage.colName', { defaultValue: 'Nom' })}</th>
                  <th style={th}>{t('superAdmin:usersPage.colRole', { defaultValue: 'Rôle' })}</th>
                  <th style={th}>{t('superAdmin:usersPage.colTenant', { defaultValue: 'Tenant' })}</th>
                  <th style={th}>{t('superAdmin:usersPage.colStatus', { defaultValue: 'Statut' })}</th>
                  <th style={th}>{t('superAdmin:usersPage.colAction', { defaultValue: 'Action' })}</th>
                </tr>
              </thead>
              <tbody>
                {data.map((u) => (
                  <UserRow key={u.id} user={u} />
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

function UserRow({ user }: { user: UserSearchRow }) {
  const { t } = useTranslation('superAdmin');
  const startImpersonation = useAuthStore((s) => s.startImpersonation);

  const enter = useMutation({
    mutationFn: () => impersonate({ tenantId: user.tenant.id }),
    onSuccess: (resp) => {
      const now = new Date().toISOString();
      startImpersonation({
        targetAccessToken: resp.accessToken,
        targetUser: {
          id: resp.user.id,
          email: resp.user.email,
          firstName: resp.user.firstName,
          lastName: resp.user.lastName,
          role: resp.user.role as Role,
          isActive: true,
          phone: null,
          createdAt: now,
          updatedAt: now,
        },
        targetTenantSlug: resp.tenant.slug,
        targetTenantName: resp.tenant.name,
        targetUserEmail: resp.user.email,
      });
      window.location.href = '/dashboard';
    },
  });

  return (
    <tr style={{ borderTop: `1px solid ${theme.colors.border}` }}>
      <td style={td}>{user.email}</td>
      <td style={td}>
        {user.firstName} {user.lastName}
      </td>
      <td style={td}>
        <span style={{ fontSize: 11, padding: '2px 6px', borderRadius: 3, background: theme.colors.surfaceAlt }}>
          {user.role}
        </span>
      </td>
      <td style={td}>
        <code style={{ fontSize: 11, color: theme.colors.primary }}>{user.tenant.slug}</code>
        <span style={{ color: theme.colors.textMuted, marginLeft: 6 }}>
          {user.tenant.name}
        </span>
      </td>
      <td style={td}>
        {user.isActive ? (
          <span style={{ color: theme.colors.success }}>{t('superAdmin:usersPage.active', { defaultValue: '✓ actif' })}</span>
        ) : (
          <span style={{ color: theme.colors.danger }}>{t('superAdmin:usersPage.inactive', { defaultValue: '✗ inactif' })}</span>
        )}
      </td>
      <td style={td}>
        <button
          onClick={() => enter.mutate()}
          disabled={enter.isPending}
          style={{ ...buttonStyles.secondary, fontSize: 12, padding: '4px 8px' }}
        >
          {enter.isPending ? '…' : t('superAdmin:usersPage.enter', { defaultValue: 'Entrer 🎭' })}
        </button>
      </td>
    </tr>
  );
}

const th: React.CSSProperties = {
  textAlign: 'left',
  padding: 8,
  fontWeight: 600,
  color: theme.colors.text,
  fontSize: 12,
};
const td: React.CSSProperties = { padding: 8, color: theme.colors.text };
