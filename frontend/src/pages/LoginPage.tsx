import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { useLogin, useLogin2fa } from '../hooks/useAuth';
import { useAuthStore } from '../context/auth.store';
import { useUiStore, type Locale } from '../context/ui.store';
import { getBranding } from '../services/super-admin.service';
import { is2faChallenge } from '../services/auth.service';
import type { LoginCredentials } from '../types';
import { theme, cardStyles, formStyles, buttonStyles } from '../theme';
import { FlagFr, FlagEn } from '../components/Flag';
import logoFr from '../assets/logo-fr.png';
import logoEn from '../assets/logo-en.png';

export default function LoginPage() {
  const { isAuthenticated, user } = useAuthStore();
  const { mutate: login, isPending, error, data: loginData } = useLogin();
  const {
    mutate: login2fa,
    isPending: is2faPending,
    error: error2fa,
  } = useLogin2fa();
  const [otpCode, setOtpCode] = useState('');
  const { t } = useTranslation('auth');
  const { t: tCommon } = useTranslation('common');
  const locale = useUiStore((s) => s.locale);
  const setLocale = useUiStore((s) => s.setLocale);

  // Per-tenant branding resolved from the subdomain (B7.5). On the apex /
  // auth subdomain this returns the generic TaskMgr branding.
  const { data: branding } = useQuery({
    queryKey: ['branding'],
    queryFn: getBranding,
    staleTime: Infinity,
    retry: false,
  });
  const brandName = branding?.name ?? 'Dispatch2Go';
  const brandLogo = branding?.logoUrl ?? null;
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginCredentials>();

  // Already authenticated → redirect to the right home for the role.
  // SUPER_ADMIN lands on its own portal (no tenant data); ADMIN /
  // DISPATCHER get the desktop dashboard; TECHNICIAN gets its mobile
  // work-orders list.
  if (isAuthenticated && user) {
    if (user.role === 'SUPER_ADMIN') {
      return <Navigate to="/super-admin/stats" replace />;
    }
    const goesToDashboard =
      user.role === 'ADMIN' || user.role === 'DISPATCHER';
    return <Navigate to={goesToDashboard ? '/dashboard' : '/mes-bons'} replace />;
  }

  const onSubmit = (data: LoginCredentials) => login(data);

  const errorMessage =
    (error as any)?.response?.data?.message ?? (error as any)?.message ?? null;

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: `linear-gradient(135deg, ${theme.colors.sidebarBg} 0%, #0f172a 100%)`,
        padding: '1rem',
      }}
    >
      <div
        style={{
          ...cardStyles.card,
          padding: '2.5rem',
          width: '100%',
          maxWidth: '400px',
          boxShadow: theme.shadows.xl,
          overflow: 'visible',
        }}
      >
        {/* Logo / Title — per-tenant when on a tenant subdomain, otherwise
            the bilingual Dispatch2Go brand logo (follows the language
            switcher at the bottom of the card). */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          {brandLogo ? (
            <>
              <img
                src={brandLogo}
                alt={brandName}
                style={{
                  maxHeight: '4rem',
                  maxWidth: '80%',
                  marginBottom: '0.5rem',
                  objectFit: 'contain',
                }}
              />
              <h1 style={{ fontSize: theme.font.size2xl, color: theme.colors.text, margin: 0, fontWeight: theme.font.weightBold }}>
                {brandName}
              </h1>
              <p style={{ color: theme.colors.textMuted, margin: '0.25rem 0 0', fontSize: theme.font.sizeSm }}>
                {t('login.subtitle')}
              </p>
            </>
          ) : (
            <img
              src={locale === 'fr' ? logoFr : logoEn}
              alt="Dispatch2Go"
              style={{
                width: '100%',
                maxWidth: 300,
                height: 'auto',
                display: 'block',
                margin: '0 auto',
              }}
            />
          )}
        </div>

        {loginData && is2faChallenge(loginData) ? (
          <Login2faForm
            pendingToken={loginData.pendingToken}
            otpCode={otpCode}
            setOtpCode={setOtpCode}
            onSubmit={() => login2fa({ pendingToken: loginData.pendingToken, code: otpCode })}
            isPending={is2faPending}
            error={error2fa}
            t={t}
          />
        ) : (
        <form onSubmit={handleSubmit(onSubmit)}>
          {/* Email */}
          <div style={{ marginBottom: '1rem' }}>
            <label style={formStyles.label}>{t('login.email')}</label>
            <input
              type="email"
              {...register('email', { required: tCommon('validation.required') })}
              style={{
                ...formStyles.input,
                borderColor: errors.email ? theme.colors.danger : theme.colors.border,
                boxSizing: 'border-box',
              }}
              placeholder="vous@exemple.com"
            />
            {errors.email && (
              <p style={formStyles.fieldError}>{errors.email.message}</p>
            )}
          </div>

          {/* Password */}
          <div style={{ marginBottom: '1.5rem' }}>
            <label style={formStyles.label}>{t('login.password')}</label>
            <input
              type="password"
              {...register('password', { required: tCommon('validation.required') })}
              style={{
                ...formStyles.input,
                borderColor: errors.password ? theme.colors.danger : theme.colors.border,
                boxSizing: 'border-box',
              }}
              placeholder="••••••••"
            />
            {errors.password && (
              <p style={formStyles.fieldError}>{errors.password.message}</p>
            )}
          </div>

          {/* API Error */}
          {errorMessage && (
            <div
              style={{
                background: theme.colors.dangerLight,
                color: 'var(--c-dangerBadgeText)',
                padding: '0.75rem',
                borderRadius: theme.radius.md,
                marginBottom: '1rem',
                fontSize: theme.font.sizeSm,
                border: '1px solid var(--c-dangerBadgeBorder)',
              }}
            >
              {errorMessage}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={isPending}
            style={{
              ...buttonStyles.primary,
              width: '100%',
              padding: '0.75rem',
              fontSize: theme.font.sizeMd,
              fontWeight: theme.font.weightSemibold,
              opacity: isPending ? 0.7 : 1,
              cursor: isPending ? 'not-allowed' : 'pointer',
              boxSizing: 'border-box',
            }}
          >
            {isPending ? t('login.loggingIn') : t('login.submit')}
          </button>
        </form>
        )}

        {/* Language switcher (pre-login, localStorage only) */}
        <div style={{ marginTop: '1.5rem', textAlign: 'center', display: 'flex', justifyContent: 'center', gap: '0.5rem' }}>
          {(['fr', 'en'] as Locale[]).map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => setLocale(l)}
              style={{
                background: locale === l ? theme.colors.primaryLight : 'transparent',
                color: locale === l ? theme.colors.primary : theme.colors.textMuted,
                border: `1px solid ${locale === l ? theme.colors.primary : theme.colors.border}`,
                borderRadius: theme.radius.md,
                padding: '0.3rem 0.75rem',
                fontSize: theme.font.sizeXs,
                fontWeight: locale === l ? theme.font.weightSemibold : theme.font.weightNormal,
                cursor: 'pointer',
              }}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                {l === 'fr' ? <FlagFr width={16} height={11} /> : <FlagEn width={16} height={11} />}
                {l === 'fr' ? 'Français' : 'English'}
              </span>
            </button>
          ))}
        </div>

        {/* B24 — privacy policy link (public page) */}
        <p style={{ marginTop: '0.75rem', textAlign: 'center', fontSize: theme.font.sizeXs }}>
          <a href="/confidentialite" style={{ color: theme.colors.textMuted, textDecoration: 'underline' }}>
            {locale === 'fr' ? 'Politique de confidentialité' : 'Privacy policy'}
          </a>
        </p>
      </div>
    </div>
  );
}

/* B14 — Second-step form for a 2FA-gated login. */
function Login2faForm({
  otpCode,
  setOtpCode,
  onSubmit,
  isPending,
  error,
  t,
}: {
  pendingToken: string;
  otpCode: string;
  setOtpCode: (v: string) => void;
  onSubmit: () => void;
  isPending: boolean;
  error: unknown;
  t: (k: string, o?: Record<string, string>) => string;
}) {
  const errorMessage =
    (error as { response?: { data?: { message?: string } } })?.response?.data?.message ??
    (error as { message?: string })?.message ??
    null;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <p style={{ marginTop: 0, fontSize: theme.font.sizeSm, color: theme.colors.text }}>
        {t('login.twoFactorPrompt', {
          defaultValue: 'Entre le code à 6 chiffres de ton application d\'authentification (ou un code de secours).',
        })}
      </p>
      <input
        autoFocus
        value={otpCode}
        onChange={(e) => setOtpCode(e.target.value)}
        placeholder="123456"
        style={{
          ...formStyles.input,
          fontFamily: 'monospace',
          fontSize: 22,
          letterSpacing: 4,
          textAlign: 'center',
          marginBottom: '0.75rem',
        }}
      />
      {errorMessage && (
        <p
          style={{
            color: theme.colors.danger,
            fontSize: theme.font.sizeSm,
            marginTop: 0,
            marginBottom: 8,
          }}
        >
          {errorMessage}
        </p>
      )}
      <button
        type="submit"
        style={{ ...buttonStyles.primary, width: '100%' }}
        disabled={isPending || otpCode.trim().length < 6}
      >
        {isPending ? '…' : t('login.verify', { defaultValue: 'Vérifier' })}
      </button>
    </form>
  );
}
