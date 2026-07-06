import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { activatePortalAccount } from '../services/portal.service';
import { theme, cardStyles, formStyles, buttonStyles } from '../theme';
import logoFr from '../assets/logo-fr.png';
import logoEn from '../assets/logo-en.png';

/**
 * B21 — public activation page. The invitation email links here with
 * ?token=… ; the client picks a password and can then log in normally.
 */
export default function PortalActivationPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const { t, i18n } = useTranslation('portal');
  const locale = i18n.language?.startsWith('en') ? 'en' : 'fr';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [done, setDone] = useState(false);

  const activate = useMutation({
    mutationFn: () => activatePortalAccount(token, password),
    onSuccess: () => setDone(true),
  });

  const mismatch = confirm.length > 0 && password !== confirm;
  const canSubmit = token && password.length >= 8 && password === confirm;

  return (
    <div
      style={{
        minHeight: '100dvh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: theme.colors.background,
        padding: '1rem',
      }}
    >
      <div style={{ ...cardStyles.card, width: '100%', maxWidth: 420, padding: '2rem' }}>
        <img
          src={locale === 'fr' ? logoFr : logoEn}
          alt="Dispatch2Go"
          style={{ display: 'block', maxWidth: 220, margin: '0 auto 1.5rem' }}
        />

        {!token && (
          <p style={{ color: theme.colors.danger, textAlign: 'center' }}>{t('activation.missingToken')}</p>
        )}

        {done ? (
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontSize: '2rem', margin: '0 0 0.5rem' }}>✅</p>
            <p style={{ color: theme.colors.text, marginBottom: '1.25rem' }}>{t('activation.success')}</p>
            <Link to="/login" style={{ ...buttonStyles.primary, textDecoration: 'none' }}>
              {t('activation.goToLogin')}
            </Link>
          </div>
        ) : (
          token && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (canSubmit && !activate.isPending) activate.mutate();
              }}
              style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}
            >
              <h1 style={{ margin: 0, fontSize: theme.font.sizeLg, color: theme.colors.text, textAlign: 'center' }}>
                {t('activation.title')}
              </h1>
              <p style={{ margin: 0, fontSize: theme.font.sizeSm, color: theme.colors.textMuted, textAlign: 'center' }}>
                {t('activation.subtitle')}
              </p>

              <div>
                <label style={formStyles.label}>{t('activation.password')}</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={8}
                  autoComplete="new-password"
                  style={formStyles.input}
                  required
                />
              </div>
              <div>
                <label style={formStyles.label}>{t('activation.confirm')}</label>
                <input
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  autoComplete="new-password"
                  style={formStyles.input}
                  required
                />
                {mismatch && (
                  <p style={{ margin: '0.35rem 0 0', fontSize: theme.font.sizeXs, color: theme.colors.danger }}>
                    {t('activation.mismatch')}
                  </p>
                )}
              </div>

              {activate.error != null && (
                <p style={{ margin: 0, fontSize: theme.font.sizeSm, color: theme.colors.danger }}>
                  {activate.error instanceof Error ? activate.error.message : t('common.loadError')}
                </p>
              )}

              <button
                type="submit"
                disabled={!canSubmit || activate.isPending}
                style={{ ...buttonStyles.primary, opacity: !canSubmit || activate.isPending ? 0.6 : 1 }}
              >
                {activate.isPending ? t('activation.submitting') : t('activation.submit')}
              </button>
            </form>
          )
        )}
      </div>
    </div>
  );
}
