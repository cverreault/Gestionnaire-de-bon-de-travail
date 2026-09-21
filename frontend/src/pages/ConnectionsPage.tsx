import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { getLoginHistory, getPresence } from '../services/users.service';
import { useTechnicians } from '../hooks/useUsers';
import api from '../services/api';
import type { ApiResponse, User } from '../types';
import { theme, cardStyles, layoutStyles, tableStyles, formStyles, buttonStyles } from '../theme';
import { formatDateTime } from '../utils/dateFormat';
import { describeAgent, formatDuration } from '../utils/presence';

const KIND_LABEL: Record<string, { fr: string; en: string; color: string }> = {
  LOGIN: { fr: 'Connexion', en: 'Sign-in', color: 'var(--c-successBadgeText)' },
  LOGIN_2FA: { fr: 'Connexion (2FA)', en: 'Sign-in (2FA)', color: 'var(--c-successBadgeText)' },
  FAILED: { fr: 'Échec', en: 'Failed', color: 'var(--c-dangerBadgeText)' },
  LOGOUT: { fr: 'Déconnexion', en: 'Sign-out', color: 'var(--c-textMuted)' },
};

function defaultFrom(): string {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return d.toISOString().slice(0, 10);
}

/** B51 — who is online now, and the login history (IP, device, date) with filters. */
export default function ConnectionsPage() {
  const { t, i18n } = useTranslation('common');
  const fr = !i18n.language.startsWith('en');
  const [userId, setUserId] = useState('');
  const [kind, setKind] = useState('');
  const [from, setFrom] = useState(defaultFrom());
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [page, setPage] = useState(1);
  void useTechnicians;

  const users = useQuery({ queryKey: ['users'], queryFn: async () => (await api.get<ApiResponse<User[]>>('/users')).data.data });
  const presence = useQuery({ queryKey: ['presence'], queryFn: () => getPresence().then((r) => r.data.data), refetchInterval: 30_000 });
  const history = useQuery({
    queryKey: ['login-history', userId, kind, from, to, page],
    queryFn: () => getLoginHistory({ userId: userId || undefined, kind: kind || undefined, from: from ? new Date(from).toISOString() : undefined, to: to ? new Date(`${to}T23:59:59`).toISOString() : undefined, page, limit: 50 }).then((r) => r.data.data),
  });
  const userBy = new Map((users.data ?? []).map((u) => [u.id, u]));
  const now = Date.now();
  const online = (presence.data ?? []).filter((p) => p.online);

  return (
    <div style={{ ...layoutStyles.page }}>
      <div style={{ ...layoutStyles.pageHeader }}>
        <div>
          <h1 style={{ ...layoutStyles.pageTitle }}>🔐 {t('connections.title', { defaultValue: 'Connexions' })}</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: theme.colors.textMuted }}>{t('connections.subtitle', { defaultValue: 'Qui est en ligne maintenant, et qui s’est connecté, d’où et quand.' })}</p>
        </div>
        <Link to="/utilisateurs" style={{ ...buttonStyles.secondary, textDecoration: 'none' }}>👥 {t('connections.backToUsers', { defaultValue: 'Utilisateurs' })}</Link>
      </div>

      <div style={{ ...cardStyles.card, marginBottom: 24 }}>
        <div style={{ ...cardStyles.cardHeader }}>
          <h2 style={{ ...cardStyles.cardTitle }}>🟢 {t('connections.onlineNow', { defaultValue: 'En ligne maintenant' })} ({online.length})</h2>
        </div>
        <div style={{ ...cardStyles.cardBody }}>
          {presence.isLoading && <p style={{ margin: 0, color: theme.colors.textMuted, fontSize: 13 }}>…</p>}
          {presence.data && online.length === 0 && <p style={{ margin: 0, color: theme.colors.textMuted, fontSize: 13 }}>{t('connections.nobody', { defaultValue: 'Personne en ligne depuis 5 minutes.' })}</p>}
          {online.length > 0 && (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6 }}>
              {online.map((p) => {
                const u = userBy.get(p.userId);
                return (
                  <li key={p.userId} style={{ display: 'flex', gap: 12, alignItems: 'center', fontSize: 13, border: theme.borders.light, borderRadius: theme.radius.md, padding: '6px 10px' }}>
                    <span style={{ width: 10, height: 10, borderRadius: '50%', background: theme.colors.success }} />
                    <span style={{ fontWeight: theme.font.weightSemibold, minWidth: 180 }}>{u ? `${u.firstName} ${u.lastName}` : p.userId}</span>
                    <span style={{ color: theme.colors.textMuted }}>
                      {p.sessionSince ? t('connections.since', { defaultValue: 'connecté depuis {{d}}', d: formatDuration(now - new Date(p.sessionSince).getTime(), i18n.language) }) : ''}
                      {p.lastSeenAt ? ` · ${t('connections.lastSeen', { defaultValue: 'vu il y a {{d}}', d: formatDuration(now - new Date(p.lastSeenAt).getTime(), i18n.language) })}` : ''}
                      {p.lastSeenIp ? ` · IP ${p.lastSeenIp}` : ''}
                      {p.activeSessions > 1 ? ` · ${t('connections.sessions', { defaultValue: '{{n}} sessions', n: p.activeSessions })}` : ''}
                      {p.mobileSessions > 0 ? ' · 📱' : ''}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      <div style={{ ...cardStyles.card }}>
        <div style={{ ...cardStyles.cardHeader, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ ...cardStyles.cardTitle }}>📜 {t('connections.history', { defaultValue: 'Historique des connexions' })}</h2>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <select value={userId} onChange={(e) => { setUserId(e.target.value); setPage(1); }} style={{ ...formStyles.select, width: 'auto' }}>
              <option value="">{t('connections.allUsers', { defaultValue: 'Tous les utilisateurs' })}</option>
              {(users.data ?? []).map((u) => <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>)}
            </select>
            <select value={kind} onChange={(e) => { setKind(e.target.value); setPage(1); }} style={{ ...formStyles.select, width: 'auto' }}>
              <option value="">{t('connections.allKinds', { defaultValue: 'Tous les types' })}</option>
              {Object.entries(KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{fr ? v.fr : v.en}</option>)}
            </select>
            <input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} style={{ ...formStyles.input, width: 'auto' }} />
            <input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} style={{ ...formStyles.input, width: 'auto' }} />
          </div>
        </div>
        <div style={{ ...cardStyles.cardBody, padding: 0 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 0 }}>
            <thead style={{ ...tableStyles.header }}>
              <tr>
                <th style={{ ...tableStyles.headerCell }}>{t('connections.colWhen', { defaultValue: 'Date et heure' })}</th>
                <th style={{ ...tableStyles.headerCell }}>{t('connections.colUser', { defaultValue: 'Utilisateur' })}</th>
                <th style={{ ...tableStyles.headerCell }}>{t('connections.colKind', { defaultValue: 'Type' })}</th>
                <th style={{ ...tableStyles.headerCell }}>IP</th>
                <th style={{ ...tableStyles.headerCell }}>{t('connections.colDevice', { defaultValue: 'Appareil' })}</th>
              </tr>
            </thead>
            <tbody>
              {(history.data?.data ?? []).map((e) => (
                <tr key={e.id}>
                  <td style={{ ...tableStyles.cell, whiteSpace: 'nowrap' }}>{formatDateTime(e.createdAt)}</td>
                  <td style={{ ...tableStyles.cell }}>{e.user ? `${e.user.firstName} ${e.user.lastName}` : e.email}{e.user && <span style={{ color: theme.colors.textMuted, fontSize: 11 }}> · {e.email}</span>}</td>
                  <td style={{ ...tableStyles.cell, color: KIND_LABEL[e.kind]?.color, fontWeight: theme.font.weightMedium }}>{fr ? KIND_LABEL[e.kind]?.fr : KIND_LABEL[e.kind]?.en}</td>
                  <td style={{ ...tableStyles.cell, fontFamily: 'monospace' }}>{e.ip ?? '—'}</td>
                  <td style={{ ...tableStyles.cell }} title={e.userAgent ?? ''}>{describeAgent(e.userAgent, e.deviceId)}</td>
                </tr>
              ))}
              {history.data && history.data.data.length === 0 && (
                <tr><td colSpan={5} style={{ ...tableStyles.cell, textAlign: 'center', color: theme.colors.textMuted }}>{t('connections.empty', { defaultValue: 'Aucune connexion dans la période.' })}</td></tr>
              )}
            </tbody>
          </table>
          {history.data && history.data.meta.totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '8px 12px', alignItems: 'center', fontSize: 12, color: theme.colors.textMuted }}>
              <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} style={{ ...buttonStyles.secondary, fontSize: 12 }}>‹</button>
              {page} / {history.data.meta.totalPages}
              <button type="button" disabled={page >= history.data.meta.totalPages} onClick={() => setPage((p) => p + 1)} style={{ ...buttonStyles.secondary, fontSize: 12 }}>›</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
