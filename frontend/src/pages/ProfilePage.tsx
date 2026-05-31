import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../context/auth.store';
import { useUiStore, type ThemeMode, type Locale } from '../context/ui.store';
import { useUpdateMyProfile, useChangeMyPassword } from '../hooks/useUsers';
import { theme, cardStyles, formStyles, buttonStyles, layoutStyles } from '../theme';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function FeedbackBanner({
  message,
  variant,
}: {
  message: string;
  variant: 'success' | 'error';
}) {
  return (
    <div
      style={{
        padding: '0.625rem 1rem',
        borderRadius: theme.radius.md,
        background: variant === 'success' ? theme.colors.successLight : theme.colors.dangerLight,
        color: variant === 'success' ? '#065f46' : '#991b1b',
        border: `1px solid ${variant === 'success' ? '#6ee7b7' : '#fca5a5'}`,
        fontSize: theme.font.sizeSm,
        marginBottom: '1rem',
      }}
    >
      {variant === 'success' ? '✓ ' : '✕ '}
      {message}
    </div>
  );
}

/** Formate une date ISO en français (ex. : 15 janvier 2025). */
function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('fr-CA', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

// ─── Indicateur de force du mot de passe ──────────────────────────────────────

type StrengthLevel = 'faible' | 'moyen' | 'fort';

interface PasswordStrength {
  level: StrengthLevel;
  label: string;
  color: string;
  bgColor: string;
  filledSegments: number;
}

function getPasswordStrength(pwd: string): PasswordStrength | null {
  if (!pwd) return null;

  let types = 0;
  if (/[a-z]/.test(pwd)) types++;
  if (/[A-Z]/.test(pwd)) types++;
  if (/[0-9]/.test(pwd)) types++;
  if (/[^a-zA-Z0-9]/.test(pwd)) types++;

  if (pwd.length < 8 || types < 2) {
    return { level: 'faible', label: 'Faible', color: theme.colors.danger, bgColor: theme.colors.dangerLight, filledSegments: 1 };
  }
  if (types >= 3) {
    return { level: 'fort', label: 'Fort', color: theme.colors.success, bgColor: theme.colors.successLight, filledSegments: 3 };
  }
  return { level: 'moyen', label: 'Moyen', color: theme.colors.warning, bgColor: theme.colors.warningLight, filledSegments: 2 };
}

function PasswordStrengthMeter({ password }: { password: string }) {
  const strength = getPasswordStrength(password);
  if (!strength) return null;

  return (
    <div style={{ marginTop: '0.375rem' }}>
      {/* Segments */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '0.25rem' }}>
        {[1, 2, 3].map((seg) => (
          <div
            key={seg}
            style={{
              flex: 1,
              height: '4px',
              borderRadius: theme.radius.full,
              background: seg <= strength.filledSegments ? strength.color : theme.colors.borderLight,
              transition: 'background 0.2s ease',
            }}
          />
        ))}
      </div>
      {/* Label */}
      <p style={{ ...formStyles.fieldHint, color: strength.color, margin: 0 }}>
        Force : <strong>{strength.label}</strong>
      </p>
    </div>
  );
}

// ─── Champ mot de passe avec bouton afficher/masquer ──────────────────────────

interface PasswordInputProps {
  value: string;
  onChange: (v: string) => void;
  onFocus: () => void;
  onBlur: () => void;
  focused: boolean;
  autoComplete?: string;
  required?: boolean;
  minLength?: number;
  extraStyle?: React.CSSProperties;
}

function PasswordInput({
  value,
  onChange,
  onFocus,
  onBlur,
  focused,
  autoComplete,
  required,
  minLength,
  extraStyle,
}: PasswordInputProps) {
  const [visible, setVisible] = useState(false);

  const inputBase: React.CSSProperties = focused
    ? { ...formStyles.input, ...formStyles.inputFocus }
    : { ...formStyles.input };

  return (
    <div style={{ position: 'relative' }}>
      <input
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={onFocus}
        onBlur={onBlur}
        style={{ ...inputBase, paddingRight: '2.5rem', ...extraStyle }}
        autoComplete={autoComplete}
        required={required}
        minLength={minLength}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        tabIndex={-1}
        aria-label={visible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
        style={{
          position: 'absolute',
          right: '0.625rem',
          top: '50%',
          transform: 'translateY(-50%)',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: '0.2rem',
          fontSize: '1rem',
          color: theme.colors.textMuted,
          lineHeight: 1,
          display: 'flex',
          alignItems: 'center',
        }}
      >
        {visible ? '🙈' : '👁️'}
      </button>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ProfilePage() {
  const { user } = useAuthStore();
  const { t } = useTranslation('auth');
  const { t: tCommon } = useTranslation('common');

  // ── Profile section state ────────────────────────────────────────────────
  const [firstName, setFirstName] = useState(user?.firstName ?? '');
  const [lastName, setLastName] = useState(user?.lastName ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [profileMsg, setProfileMsg] = useState<{ text: string; variant: 'success' | 'error' } | null>(null);

  // ── Password section state ───────────────────────────────────────────────
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwdMsg, setPwdMsg] = useState<{ text: string; variant: 'success' | 'error' } | null>(null);

  // ── Focus tracking ───────────────────────────────────────────────────────
  const [focusedField, setFocusedField] = useState<string | null>(null);

  const updateProfile = useUpdateMyProfile();
  const changePassword = useChangeMyPassword();

  // ── Handlers ────────────────────────────────────────────────────────────

  async function handleProfileSubmit(e: React.FormEvent) {
    e.preventDefault();
    setProfileMsg(null);
    try {
      await updateProfile.mutateAsync({ firstName, lastName, phone: phone || undefined });
      setProfileMsg({ text: t('profile.saved'), variant: 'success' });
    } catch {
      setProfileMsg({ text: tCommon('messages.genericError'), variant: 'error' });
    }
  }

  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPwdMsg(null);

    if (newPassword.length < 8) {
      setPwdMsg({ text: t('profile.passwordTooShort', { defaultValue: 'Le nouveau mot de passe doit comporter au moins 8 caractères.' }), variant: 'error' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwdMsg({ text: t('profile.passwordsMismatch', { defaultValue: 'Les mots de passe ne correspondent pas.' }), variant: 'error' });
      return;
    }

    try {
      await changePassword.mutateAsync({ currentPassword, newPassword });
      setPwdMsg({ text: t('profile.passwordChanged'), variant: 'success' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch {
      setPwdMsg({
        text: t('profile.passwordError', { defaultValue: 'Erreur : mot de passe actuel incorrect ou nouvelle valeur invalide.' }),
        variant: 'error',
      });
    }
  }

  // ── Input style helpers ──────────────────────────────────────────────────

  function inputStyle(field: string): React.CSSProperties {
    return focusedField === field
      ? { ...formStyles.input, ...formStyles.inputFocus }
      : formStyles.input;
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div style={{ ...layoutStyles.page, maxWidth: '640px' }}>
      {/* Page title */}
      <div style={{ ...layoutStyles.pageHeader }}>
        <h1 style={{ ...layoutStyles.pageTitle }}>{t('profile.title')}</h1>
      </div>

      {/* ── Section 1 : Personal info ── */}
      <div style={{ ...cardStyles.card, marginBottom: '1.5rem' }}>
        <div style={{ ...cardStyles.cardHeader }}>
          <h2 style={{ ...cardStyles.cardTitle }}>👤 {t('profile.personalInfo')}</h2>
        </div>

        <form onSubmit={handleProfileSubmit}>
          <div style={{ ...cardStyles.cardBody }}>
            {profileMsg && (
              <FeedbackBanner message={profileMsg.text} variant={profileMsg.variant} />
            )}

            {/* Email — read-only */}
            <div style={{ ...formStyles.fieldGroup }}>
              <label style={{ ...formStyles.label }}>{t('login.email')}</label>
              <input
                type="email"
                value={user?.email ?? ''}
                readOnly
                style={{ ...formStyles.inputDisabled }}
              />
              <p style={{ ...formStyles.fieldHint }}>{t('profile.emailReadOnly')}</p>
            </div>

            {/* Role — read-only */}
            <div style={{ ...formStyles.fieldGroup }}>
              <label style={{ ...formStyles.label }}>{t('profile.role')}</label>
              <input
                type="text"
                value={user?.role ? t(`roles.${user.role}`) : ''}
                readOnly
                style={{ ...formStyles.inputDisabled }}
              />
            </div>

            {/* Created date — read-only */}
            {user?.createdAt && (
              <div style={{ ...formStyles.fieldGroup }}>
                <label style={{ ...formStyles.label }}>{t('profile.memberSince')}</label>
                <input
                  type="text"
                  value={formatDate(user.createdAt)}
                  readOnly
                  style={{ ...formStyles.inputDisabled }}
                />
              </div>
            )}

            {/* First name / Last name side by side */}
            <div style={{ ...formStyles.fieldGrid2, marginBottom: '1rem' }}>
              <div>
                <label style={{ ...formStyles.label }}>{t('profile.firstName')}</label>
                <input
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  onFocus={() => setFocusedField('firstName')}
                  onBlur={() => setFocusedField(null)}
                  style={inputStyle('firstName')}
                  required
                />
              </div>
              <div>
                <label style={{ ...formStyles.label }}>{t('profile.lastName')}</label>
                <input
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  onFocus={() => setFocusedField('lastName')}
                  onBlur={() => setFocusedField(null)}
                  style={inputStyle('lastName')}
                  required
                />
              </div>
            </div>

            {/* Phone */}
            <div style={{ ...formStyles.fieldGroup }}>
              <label style={{ ...formStyles.label }}>{t('profile.phone')}</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                onFocus={() => setFocusedField('phone')}
                onBlur={() => setFocusedField(null)}
                style={inputStyle('phone')}
                placeholder="Ex. : 514-555-0100"
              />
            </div>
          </div>

          <div style={{ ...cardStyles.cardFooter }}>
            <button
              type="submit"
              disabled={updateProfile.isPending}
              style={{
                ...buttonStyles.primary,
                ...(updateProfile.isPending ? buttonStyles.disabled : {}),
              }}
            >
              {updateProfile.isPending ? t('profile.saving') : `💾 ${t('profile.save')}`}
            </button>
          </div>
        </form>
      </div>

      {/* ── Section : Apparence (thème) ── */}
      <AppearanceSection />

      {/* ── Section 2 : Change password ── */}
      <div style={{ ...cardStyles.card }}>
        <div style={{ ...cardStyles.cardHeader }}>
          <h2 style={{ ...cardStyles.cardTitle }}>🔐 {t('profile.changePassword')}</h2>
        </div>

        <form onSubmit={handlePasswordSubmit}>
          <div style={{ ...cardStyles.cardBody }}>
            {pwdMsg && (
              <FeedbackBanner message={pwdMsg.text} variant={pwdMsg.variant} />
            )}

            {/* Current password */}
            <div style={{ ...formStyles.fieldGroup }}>
              <label style={{ ...formStyles.label }}>{t('profile.currentPassword')}</label>
              <PasswordInput
                value={currentPassword}
                onChange={setCurrentPassword}
                onFocus={() => setFocusedField('currentPassword')}
                onBlur={() => setFocusedField(null)}
                focused={focusedField === 'currentPassword'}
                autoComplete="current-password"
                required
              />
            </div>

            {/* New password */}
            <div style={{ ...formStyles.fieldGroup }}>
              <label style={{ ...formStyles.label }}>{t('profile.newPassword')}</label>
              <PasswordInput
                value={newPassword}
                onChange={setNewPassword}
                onFocus={() => setFocusedField('newPassword')}
                onBlur={() => setFocusedField(null)}
                focused={focusedField === 'newPassword'}
                autoComplete="new-password"
                minLength={8}
                required
              />
              <p style={{ ...formStyles.fieldHint }}>{t('profile.passwordMinHint', { defaultValue: 'Minimum 8 caractères.' })}</p>
              <PasswordStrengthMeter password={newPassword} />
            </div>

            {/* Confirm new password */}
            <div style={{ ...formStyles.fieldGroup }}>
              <label style={{ ...formStyles.label }}>{t('profile.confirmPassword')}</label>
              <PasswordInput
                value={confirmPassword}
                onChange={setConfirmPassword}
                onFocus={() => setFocusedField('confirmPassword')}
                onBlur={() => setFocusedField(null)}
                focused={focusedField === 'confirmPassword'}
                autoComplete="new-password"
                required
                extraStyle={
                  confirmPassword && confirmPassword !== newPassword
                    ? { borderColor: theme.colors.danger }
                    : undefined
                }
              />
              {confirmPassword && confirmPassword !== newPassword && (
                <p style={{ ...formStyles.fieldError }}>{t('profile.passwordsMismatch', { defaultValue: 'Les mots de passe ne correspondent pas.' })}</p>
              )}
            </div>
          </div>

          <div style={{ ...cardStyles.cardFooter }}>
            <button
              type="submit"
              disabled={changePassword.isPending || (!!confirmPassword && confirmPassword !== newPassword)}
              style={{
                ...buttonStyles.primary,
                ...(changePassword.isPending || (!!confirmPassword && confirmPassword !== newPassword)
                  ? buttonStyles.disabled
                  : {}),
              }}
            >
              {changePassword.isPending ? t('profile.saving') : `🔑 ${t('profile.changePassword')}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/**
 * Theme + language pickers.
 * Phase 5 also syncs both choices into `User.preferences` server-side.
 */
function AppearanceSection() {
  const { t } = useTranslation('auth');
  const themeMode = useUiStore((s) => s.theme);
  const setTheme = useUiStore((s) => s.setTheme);
  const locale = useUiStore((s) => s.locale);
  const setLocale = useUiStore((s) => s.setLocale);

  const themeOptions: Array<{ value: ThemeMode; label: string; icon: string }> = [
    { value: 'light',  label: t('profile.themeLight'),  icon: '☀️' },
    { value: 'dark',   label: t('profile.themeDark'),   icon: '🌙' },
    { value: 'system', label: t('profile.themeSystem'), icon: '🖥️' },
  ];

  const localeOptions: Array<{ value: Locale; label: string; flag: string }> = [
    { value: 'fr', label: 'Français', flag: '🇫🇷' },
    { value: 'en', label: 'English',  flag: '🇬🇧' },
  ];

  return (
    <div style={{ ...cardStyles.card, marginBottom: '1.5rem' }}>
      <div style={{ ...cardStyles.cardHeader }}>
        <h2 style={{ ...cardStyles.cardTitle }}>🎨 {t('profile.appearance')}</h2>
      </div>
      <div style={{ ...cardStyles.cardBody }}>
        {/* Theme */}
        <label style={{ ...formStyles.label }}>{t('profile.themeLabel')}</label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem', marginTop: '0.25rem' }}>
          {themeOptions.map((opt) => {
            const active = themeMode === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setTheme(opt.value)}
                style={{
                  padding: '0.75rem',
                  borderRadius: theme.radius.md,
                  border: `2px solid ${active ? theme.colors.primary : theme.colors.border}`,
                  background: active ? theme.colors.primaryLight : theme.colors.surface,
                  color: active ? theme.colors.primary : theme.colors.text,
                  fontWeight: active ? theme.font.weightSemibold : theme.font.weightMedium,
                  fontSize: theme.font.sizeSm,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '0.25rem',
                }}
              >
                <span style={{ fontSize: '1.4rem' }}>{opt.icon}</span>
                {opt.label}
              </button>
            );
          })}
        </div>
        <p style={{ ...formStyles.fieldHint, marginTop: '0.5rem', marginBottom: '1rem' }}>
          {t('profile.themeHint')}
        </p>

        {/* Language */}
        <label style={{ ...formStyles.label }}>{t('profile.language')}</label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.5rem', marginTop: '0.25rem' }}>
          {localeOptions.map((opt) => {
            const active = locale === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setLocale(opt.value)}
                style={{
                  padding: '0.75rem',
                  borderRadius: theme.radius.md,
                  border: `2px solid ${active ? theme.colors.primary : theme.colors.border}`,
                  background: active ? theme.colors.primaryLight : theme.colors.surface,
                  color: active ? theme.colors.primary : theme.colors.text,
                  fontWeight: active ? theme.font.weightSemibold : theme.font.weightMedium,
                  fontSize: theme.font.sizeSm,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.5rem',
                }}
              >
                <span style={{ fontSize: '1.4rem' }}>{opt.flag}</span>
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
