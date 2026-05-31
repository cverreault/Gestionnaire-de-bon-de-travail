import { useForm } from 'react-hook-form';
import { Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLogin } from '../hooks/useAuth';
import { useAuthStore } from '../context/auth.store';
import { useUiStore, type Locale } from '../context/ui.store';
import type { LoginCredentials } from '../types';
import { theme, cardStyles, formStyles, buttonStyles } from '../theme';

export default function LoginPage() {
  const { isAuthenticated, user } = useAuthStore();
  const { mutate: login, isPending, error } = useLogin();
  const { t } = useTranslation('auth');
  const { t: tCommon } = useTranslation('common');
  const locale = useUiStore((s) => s.locale);
  const setLocale = useUiStore((s) => s.setLocale);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginCredentials>();

  // Already authenticated → redirect
  if (isAuthenticated && user) {
    return <Navigate to={user.role === 'ADMIN' ? '/dashboard' : '/mes-bons'} replace />;
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
        {/* Logo / Title */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>🔧</div>
          <h1 style={{ fontSize: theme.font.size2xl, color: theme.colors.text, margin: 0, fontWeight: theme.font.weightBold }}>
            TaskMgr
          </h1>
          <p style={{ color: theme.colors.textMuted, margin: '0.25rem 0 0', fontSize: theme.font.sizeSm }}>
            {t('login.subtitle')}
          </p>
        </div>

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
              {l === 'fr' ? '🇫🇷 Français' : '🇬🇧 English'}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
