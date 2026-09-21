import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { getLoginHistory, getUserDevices, getUserSessions, revokeUserDevice, revokeUserSessions } from '../services/users.service';
import { describeAgent, formatDuration } from '../utils/presence';
import type { MobileDevice } from '../types';
import { theme, buttonStyles, modalStyles } from '../theme';

interface Props {
  userId: string;
  userName: string;
  onClose: () => void;
}

/**
 * Admin view of a user's sessions : registered mobile devices (revocable one
 * by one) and a « log out everywhere » action that cuts every refresh token
 * and device. Closes only through the ✕ / Fermer buttons.
 */
export default function UserSessionsModal({ userId, userName, onClose }: Props) {
  const { t, i18n } = useTranslation('common');
  const qc = useQueryClient();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const locale = i18n.language.startsWith('en') ? 'en-CA' : 'fr-CA';

  // B51 — active sessions and recent logins
  const sessions = useQuery({ queryKey: ['users', userId, 'sessions'], queryFn: () => getUserSessions(userId).then((r) => r.data.data) });
  const logins = useQuery({ queryKey: ['users', userId, 'logins'], queryFn: () => getLoginHistory({ userId, limit: 10 }).then((r) => r.data.data.data) });

  const devices = useQuery({
    queryKey: ['users', userId, 'devices'],
    queryFn: () => getUserDevices(userId).then((r) => (r.data?.data ?? r.data) as MobileDevice[]),
  });

  const revokeDevice = useMutation({
    mutationFn: (installationId: string) => revokeUserDevice(userId, installationId),
    onSuccess: () => {
      setError(null);
      setMessage(t('usersPage.sessions.deviceRevoked', { defaultValue: 'Appareil déconnecté.' }));
      qc.invalidateQueries({ queryKey: ['users', userId, 'devices'] });
    },
    onError: () => setError(t('usersPage.errorGeneric', { defaultValue: 'Une erreur est survenue. Veuillez réessayer.' })),
  });

  const revokeAll = useMutation({
    mutationFn: () => revokeUserSessions(userId).then((r) => (r.data?.data ?? r.data) as { refreshTokens: number; devices: number }),
    onSuccess: (res) => {
      setError(null);
      setMessage(t('usersPage.sessions.allRevoked', { defaultValue: '{{sessions}} session(s) et {{devices}} appareil(s) déconnectés.', sessions: res.refreshTokens, devices: res.devices }));
      qc.invalidateQueries({ queryKey: ['users', userId, 'devices'] });
      qc.invalidateQueries({ queryKey: ['users', userId, 'sessions'] });
    },
    onError: () => setError(t('usersPage.errorGeneric', { defaultValue: 'Une erreur est survenue. Veuillez réessayer.' })),
  });

  function fmt(iso: string) {
    return new Date(iso).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' });
  }

  return (
    <div style={{ ...modalStyles.overlay }}>
      <div style={{ ...modalStyles.content, maxWidth: '560px' }}>
        <div style={{ ...modalStyles.header }}>
          <h2 style={{ ...modalStyles.headerTitle }}>
            {t('usersPage.sessions.title', { defaultValue: 'Sessions de {{name}}', name: userName })}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('usersPage.close', { defaultValue: 'Fermer' })}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.25rem', color: theme.colors.textLight }}
          >
            ✕
          </button>
        </div>

        <div style={{ padding: '1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <p style={{ margin: 0, fontSize: theme.font.sizeSm, color: theme.colors.textMuted }}>
            {t('usersPage.sessions.hint', { defaultValue: "Déconnecter partout révoque toutes les sessions web et mobiles ; l'utilisateur devra se reconnecter. Les accès en cours expirent d'eux-mêmes en quelques minutes." })}
          </p>

          <div>
            <div style={{ fontSize: theme.font.sizeXs, fontWeight: theme.font.weightSemibold, textTransform: 'uppercase', color: theme.colors.textMuted, marginBottom: '0.4rem' }}>
              {t('usersPage.sessions.active', { defaultValue: 'Sessions actives' })}
            </div>
            {sessions.data && sessions.data.length === 0 && <div style={{ fontSize: theme.font.sizeSm, color: theme.colors.textMuted }}>{t('usersPage.sessions.noSession', { defaultValue: 'Aucune session active.' })}</div>}
            {sessions.data && sessions.data.length > 0 && (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                {sessions.data.map((s) => (
                  <li key={s.family} style={{ fontSize: theme.font.sizeSm, border: `1px solid ${theme.colors.border}`, borderRadius: theme.radius.md, padding: '0.4rem 0.75rem' }}>
                    <span style={{ fontWeight: theme.font.weightMedium }}>{s.deviceId ? '📱' : '💻'} {describeAgent(s.userAgent, s.deviceId)}</span>
                    <span style={{ color: theme.colors.textMuted }}> · {t('usersPage.sessions.startedSince', { defaultValue: 'ouverte depuis {{d}}', d: formatDuration(Date.now() - new Date(s.startedAt).getTime(), i18n.language) })} ({fmt(s.startedAt)})</span>
                    {s.ip && <span style={{ color: theme.colors.textMuted, fontFamily: 'monospace' }}> · {s.ip}</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <div style={{ fontSize: theme.font.sizeXs, fontWeight: theme.font.weightSemibold, textTransform: 'uppercase', color: theme.colors.textMuted, marginBottom: '0.4rem' }}>
              {t('usersPage.sessions.recentLogins', { defaultValue: 'Dernières connexions' })}
            </div>
            {logins.data && logins.data.length === 0 && <div style={{ fontSize: theme.font.sizeSm, color: theme.colors.textMuted }}>{t('usersPage.sessions.noLogin', { defaultValue: 'Aucune connexion enregistrée.' })}</div>}
            {logins.data && logins.data.length > 0 && (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '0.2rem', fontSize: theme.font.sizeXs }}>
                {logins.data.map((e) => (
                  <li key={e.id} style={{ color: e.kind === 'FAILED' ? theme.colors.danger : theme.colors.textSecondary }}>
                    {fmt(e.createdAt)} · {e.kind === 'FAILED' ? t('usersPage.sessions.failed', { defaultValue: 'échec' }) : e.kind === 'LOGOUT' ? t('usersPage.sessions.logout', { defaultValue: 'déconnexion' }) : t('usersPage.sessions.login', { defaultValue: 'connexion' })}
                    {e.ip ? ` · ${e.ip}` : ''} · {describeAgent(e.userAgent, e.deviceId)}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <div style={{ fontSize: theme.font.sizeXs, fontWeight: theme.font.weightSemibold, textTransform: 'uppercase', color: theme.colors.textMuted, marginBottom: '0.4rem' }}>
              {t('usersPage.sessions.devices', { defaultValue: 'Appareils mobiles' })}
            </div>
            {devices.isLoading && <div style={{ fontSize: theme.font.sizeSm }}>{t('loading', { defaultValue: 'Chargement…' })}</div>}
            {devices.data && devices.data.length === 0 && (
              <div style={{ fontSize: theme.font.sizeSm, color: theme.colors.textMuted }}>
                {t('usersPage.sessions.noDevice', { defaultValue: 'Aucun appareil mobile enregistré.' })}
              </div>
            )}
            {devices.data && devices.data.length > 0 && (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                {devices.data.map((d) => (
                  <li key={d.installationId} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', border: `1px solid ${theme.colors.border}`, borderRadius: theme.radius.md, padding: '0.5rem 0.75rem' }}>
                    <span style={{ fontSize: '1.2rem' }}>{d.platform === 'IOS' ? '' : '🤖'}</span>
                    <div style={{ flex: 1, minWidth: 0, fontSize: theme.font.sizeSm }}>
                      <div style={{ fontWeight: theme.font.weightMedium }}>
                        {d.model ?? d.platform} · v{d.appVersion}{d.osVersion ? ` · ${d.platform === 'IOS' ? 'iOS' : 'Android'} ${d.osVersion}` : ''}
                      </div>
                      <div style={{ color: theme.colors.textMuted, fontSize: theme.font.sizeXs }}>
                        {t('usersPage.sessions.lastSeen', { defaultValue: 'Vu le {{date}}', date: fmt(d.lastSeenAt) })}
                        {' · '}
                        {d.hasPushToken ? t('usersPage.sessions.pushOn', { defaultValue: 'push actif' }) : t('usersPage.sessions.pushOff', { defaultValue: 'sans push' })}
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={revokeDevice.isPending}
                      onClick={() => revokeDevice.mutate(d.installationId)}
                      style={{ ...buttonStyles.secondary, fontSize: theme.font.sizeXs, color: theme.colors.danger }}
                    >
                      {t('usersPage.sessions.revokeDevice', { defaultValue: 'Déconnecter' })}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {message && <div style={{ fontSize: theme.font.sizeSm, color: theme.colors.success }}>{message}</div>}
          {error && <div style={{ fontSize: theme.font.sizeSm, color: theme.colors.danger }}>{error}</div>}

          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              disabled={revokeAll.isPending}
              onClick={() => {
                if (window.confirm(t('usersPage.sessions.confirmAll', { defaultValue: 'Déconnecter {{name}} de tous ses appareils et navigateurs ?', name: userName }))) revokeAll.mutate();
              }}
              style={{ ...buttonStyles.danger, fontSize: theme.font.sizeSm }}
            >
              {t('usersPage.sessions.revokeAll', { defaultValue: 'Déconnecter partout' })}
            </button>
            <button type="button" onClick={onClose} style={{ ...buttonStyles.secondary, fontSize: theme.font.sizeSm }}>
              {t('usersPage.close', { defaultValue: 'Fermer' })}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
