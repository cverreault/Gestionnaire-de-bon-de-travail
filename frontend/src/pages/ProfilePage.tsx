import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../context/auth.store';
import { useUiStore, type ThemeMode, type Locale } from '../context/ui.store';
import { useUpdateMyProfile, useChangeMyPassword } from '../hooks/useUsers';
import { useNotificationPreferences, useUpdateNotificationPreferences } from '../hooks/useNotifications';
import { useUserPreferences, useUpdateUserPreferences } from '../hooks/useUserPreferences';
import { Role } from '../types';
import type { NotifiableEventName, PerEventPrefs } from '../services/notifications.service';
import {
  enablePush,
  disablePush,
  getPushState,
  isPushSupported,
  type PushState,
} from '../utils/pushRegistration';
import { theme, cardStyles, formStyles, buttonStyles, layoutStyles } from '../theme';
import { FlagFr, FlagEn } from '../components/Flag';
import { QRCodeSVG } from 'qrcode.react';
import { toast } from '../context/toast.store';
import {
  beginTotpSetup,
  disableTotp,
  enableTotp,
  getTotpStatus,
  type TotpSetupResult,
} from '../services/totp.service';

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
        color: variant === 'success' ? 'var(--c-successBadgeText)' : 'var(--c-dangerBadgeText)',
        border: `1px solid ${variant === 'success' ? 'var(--c-successBadgeBorder)' : 'var(--c-dangerBadgeBorder)'}`,
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

      {/* ── Section : Préférences de notifications ── */}
      <NotificationPreferencesSection />

      {/* ── Section : Sécurité — 2FA (B14) ── */}
      <TotpSection />

      {/* ── Section : Suivi GPS (TECH only) ── */}
      <GpsTrackingSection />

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

  // SVG flags — 🇫🇷/🇬🇧 emoji don't render on Windows and most Linux browsers,
  // fall back to the letter pair « FR »/« GB ». Inline SVG works everywhere.
  const localeOptions: Array<{ value: Locale; label: string; Flag: () => JSX.Element }> = [
    { value: 'fr', label: 'Français', Flag: () => <FlagFr width={22} height={16} /> },
    { value: 'en', label: 'English',  Flag: () => <FlagEn width={22} height={16} /> },
  ];

  return (
    <div style={{ ...cardStyles.card, marginBottom: '1.5rem' }}>
      <div style={{ ...cardStyles.cardHeader }}>
        <h2 style={{ ...cardStyles.cardTitle }}>🎨 {t('profile.appearance')}</h2>
      </div>
      <div style={{ ...cardStyles.cardBody }}>
        {/* Theme */}
        <label style={{ ...formStyles.label }}>{t('profile.themeLabel')}</label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: '0.5rem', marginTop: '0.25rem' }}>
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
                <opt.Flag />
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Notification preferences (B1.2) ─────────────────────────────────────────

const EVENT_LABELS: Record<string, string> = {
  'workOrder.assigned':  'Un BT m\'est assigné',
  'workOrder.completed': 'Un BT est terminé',
};

function NotificationPreferencesSection() {
  const { t } = useTranslation();
  const { data, isLoading, isError } = useNotificationPreferences();
  const mutation = useUpdateNotificationPreferences();

  // ── Push registration state (browser-side) ───────────────────────────────
  const [pushState, setPushState] = useState<PushState | null>(null);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushError, setPushError] = useState<string | null>(null);

  useEffect(() => {
    if (!isPushSupported()) { setPushState('unsupported'); return; }
    getPushState().then(setPushState).catch(() => setPushState('unsupported'));
  }, []);

  async function handleEnablePush() {
    setPushBusy(true);
    setPushError(null);
    try {
      await enablePush();
      setPushState('granted');
    } catch (err) {
      const msg = (err as Error).message;
      if (msg === 'permission-denied') setPushError("Permission refusée par le navigateur — autorisez les notifications puis réessayez.");
      else if (msg === 'server-disabled') setPushError("Le serveur n'a pas de clés VAPID configurées — contactez l'administrateur.");
      else if (msg === 'unsupported') setPushError("Ce navigateur ne supporte pas les notifications push.");
      else setPushError("Impossible d'activer les notifications push.");
      setPushState(await getPushState().catch(() => 'unsupported' as PushState));
    } finally {
      setPushBusy(false);
    }
  }

  async function handleDisablePush() {
    setPushBusy(true);
    setPushError(null);
    try {
      await disablePush();
      setPushState('unsubscribed');
    } catch {
      setPushError("Impossible de désactiver les notifications push.");
    } finally {
      setPushBusy(false);
    }
  }

  function toggle(event: NotifiableEventName, channel: keyof PerEventPrefs, next: boolean) {
    mutation.mutate({ [event]: { [channel]: next } } as Partial<Record<NotifiableEventName, Partial<PerEventPrefs>>>);
  }

  return (
    <div style={{ ...cardStyles.card }}>
      <div style={{ ...cardStyles.cardHeader }}>
        <h2 style={{ ...cardStyles.cardTitle }}>🔔 Préférences de notifications</h2>
      </div>
      <div style={{ ...cardStyles.cardBody }}>
        {isLoading && (
          <p style={{ color: theme.colors.textMuted, margin: 0 }}>{t('common:messages.loading', { defaultValue: 'Chargement…' })}</p>
        )}
        {isError && (
          <p style={{ color: theme.colors.danger, margin: 0 }}>
            Impossible de charger les préférences. Réessayez plus tard.
          </p>
        )}
        {data && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <p style={{
              margin: 0,
              fontSize: theme.font.sizeSm,
              color: theme.colors.textMuted,
            }}>
              L'option « En-app » contrôle la cloche en haut à droite. L'email
              dépend de la configuration SMTP du serveur. Le canal « Push »
              nécessite que vous activiez les notifications push ci-dessous.
            </p>

            {/* ── Push activation toggle ───────────────────────────────── */}
            <div style={{
              padding: '0.75rem 1rem',
              background: theme.colors.surfaceAlt,
              border: theme.borders.light,
              borderRadius: theme.radius.md,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '1rem',
              flexWrap: 'wrap',
            }}>
              <div style={{ minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: theme.font.sizeSm, fontWeight: theme.font.weightSemibold, color: theme.colors.text }}>
                  📲 Notifications push (navigateur)
                </p>
                <p style={{ margin: '0.2rem 0 0', fontSize: theme.font.sizeXs, color: theme.colors.textMuted }}>
                  {pushState === null && 'Vérification…'}
                  {pushState === 'unsupported' && 'Non supporté sur ce navigateur.'}
                  {pushState === 'denied' && 'Bloqué par le navigateur — autorisez les notifications dans les paramètres du site.'}
                  {pushState === 'default' && "Pas encore activé. Cliquez sur « Activer » pour recevoir des notifications même quand l'onglet est fermé."}
                  {pushState === 'unsubscribed' && 'Permission accordée mais pas activé. Cliquez sur « Activer ».'}
                  {pushState === 'granted' && '✅ Actif sur ce navigateur.'}
                </p>
                {pushError && (
                  <p style={{ margin: '0.3rem 0 0', fontSize: theme.font.sizeXs, color: theme.colors.danger }}>
                    {pushError}
                  </p>
                )}
              </div>
              <div style={{ flexShrink: 0 }}>
                {(pushState === 'default' || pushState === 'unsubscribed') && (
                  <button
                    type="button"
                    onClick={handleEnablePush}
                    disabled={pushBusy}
                    style={{ ...buttonStyles.primary, fontSize: theme.font.sizeSm }}
                  >
                    {pushBusy ? 'Activation…' : 'Activer'}
                  </button>
                )}
                {pushState === 'granted' && (
                  <button
                    type="button"
                    onClick={handleDisablePush}
                    disabled={pushBusy}
                    style={{ ...buttonStyles.secondary, fontSize: theme.font.sizeSm }}
                  >
                    {pushBusy ? 'Désactivation…' : 'Désactiver'}
                  </button>
                )}
              </div>
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: theme.font.sizeSm }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: '0.5rem', color: theme.colors.textMuted, fontWeight: theme.font.weightMedium, borderBottom: theme.borders.light }}>
                    Événement
                  </th>
                  <th style={{ width: '90px', textAlign: 'center', padding: '0.5rem', color: theme.colors.textMuted, fontWeight: theme.font.weightMedium, borderBottom: theme.borders.light }}>
                    🔔 En-app
                  </th>
                  <th style={{ width: '90px', textAlign: 'center', padding: '0.5rem', color: theme.colors.textMuted, fontWeight: theme.font.weightMedium, borderBottom: theme.borders.light }}>
                    ✉️ Email
                  </th>
                  <th style={{ width: '90px', textAlign: 'center', padding: '0.5rem', color: theme.colors.textMuted, fontWeight: theme.font.weightMedium, borderBottom: theme.borders.light }}>
                    📲 Push
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.events.map((evt) => {
                  const prefs = data.preferences[evt];
                  return (
                    <tr key={evt} style={{ borderBottom: theme.borders.light }}>
                      <td style={{ padding: '0.5rem', color: theme.colors.text }}>
                        {EVENT_LABELS[evt] ?? evt}
                      </td>
                      <td style={{ padding: '0.5rem', textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={prefs.inApp}
                          disabled={mutation.isPending}
                          onChange={(e) => toggle(evt, 'inApp', e.target.checked)}
                          aria-label={`En-app pour ${EVENT_LABELS[evt] ?? evt}`}
                        />
                      </td>
                      <td style={{ padding: '0.5rem', textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={prefs.email}
                          disabled={mutation.isPending}
                          onChange={(e) => toggle(evt, 'email', e.target.checked)}
                          aria-label={`Email pour ${EVENT_LABELS[evt] ?? evt}`}
                        />
                      </td>
                      <td style={{ padding: '0.5rem', textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={prefs.push}
                          disabled={mutation.isPending || pushState !== 'granted'}
                          onChange={(e) => toggle(evt, 'push', e.target.checked)}
                          aria-label={`Push pour ${EVENT_LABELS[evt] ?? evt}`}
                          title={pushState !== 'granted' ? 'Activez les notifications push ci-dessus pour utiliser ce canal' : undefined}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {mutation.isError && (
              <p style={{ color: theme.colors.danger, fontSize: theme.font.sizeSm, margin: 0 }}>
                Échec de la mise à jour — la case est revenue à son ancien état.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── GPS opt-in (B5.3) ──────────────────────────────────────────────────────
/**
 * TECH-only toggle that stores `gps.enabled` in User.preferences.
 *
 * The hook on App.tsx (useGpsTracker) reads the same value and
 * calls navigator.geolocation when it flips to true. The browser's
 * OS-level permission prompt happens then — denying it leaves the
 * preference ON but no rows get posted until the user grants it.
 */
function GpsTrackingSection() {
  const user = useAuthStore((s) => s.user);
  const { data: prefs } = useUserPreferences();
  const updatePrefs = useUpdateUserPreferences();

  // Section is TECH-only — admins/dispatchers can't post their own positions.
  if (user?.role !== Role.TECHNICIAN) return null;

  const enabled =
    !!prefs &&
    typeof prefs.gps === 'object' &&
    prefs.gps !== null &&
    (prefs.gps as { enabled?: boolean }).enabled === true;

  return (
    <div style={{ ...cardStyles.card }}>
      <div style={{ ...cardStyles.cardHeader }}>
        <h2 style={{ ...cardStyles.cardTitle }}>📍 Suivi de position</h2>
      </div>
      <div style={{ ...cardStyles.cardBody, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <p style={{ color: theme.colors.textMuted, margin: 0, fontSize: theme.font.sizeSm }}>
          En activant ce suivi, votre position GPS est transmise au répartiteur pendant que vous êtes connecté. Les données sont conservées 7 jours puis supprimées automatiquement (Loi 25 / PIPEDA). Vous pouvez désactiver le suivi en tout temps.
        </p>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={enabled}
            disabled={updatePrefs.isPending}
            onChange={(e) =>
              updatePrefs.mutate({
                ...(prefs ?? {}),
                gps: { enabled: e.target.checked },
              })
            }
            aria-label="Activer le suivi GPS"
          />
          <span style={{ color: theme.colors.text }}>
            Partager ma position avec le répartiteur
          </span>
        </label>
        {updatePrefs.isError && (
          <p style={{ color: theme.colors.danger, fontSize: theme.font.sizeSm, margin: 0 }}>
            Échec de la mise à jour — la case est revenue à son ancien état.
          </p>
        )}
      </div>
    </div>
  );
}

// ─── B14 — 2FA/TOTP section ──────────────────────────────────────────────

function TotpSection() {
  const { t } = useTranslation();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [setup, setSetup] = useState<TotpSetupResult | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [disableOpen, setDisableOpen] = useState(false);
  const [disablePwd, setDisablePwd] = useState('');
  const [disableCode, setDisableCode] = useState('');

  useEffect(() => {
    getTotpStatus()
      .then((s) => setEnabled(s.enabled))
      .catch(() => setEnabled(false));
  }, []);

  async function handleBeginSetup() {
    setBusy(true);
    try {
      const r = await beginTotpSetup();
      setSetup(r);
    } catch (err) {
      toast.error(extractErr(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleEnable() {
    setBusy(true);
    try {
      await enableTotp(code);
      setEnabled(true);
      setSetup(null);
      setCode('');
      toast.success('2FA activé — les prochaines connexions demanderont un code.');
    } catch (err) {
      toast.error(extractErr(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleDisable() {
    setBusy(true);
    try {
      await disableTotp(disablePwd, disableCode);
      setEnabled(false);
      setDisableOpen(false);
      setDisablePwd('');
      setDisableCode('');
      toast.success('2FA désactivé.');
    } catch (err) {
      toast.error(extractErr(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ ...cardStyles.card, marginBottom: '1.5rem' }}>
      <div style={cardStyles.cardHeader}>
        <h2 style={cardStyles.cardTitle}>🔐 Sécurité — Double authentification (2FA)</h2>
      </div>
      <div style={cardStyles.cardBody}>
        {enabled === null && <p style={{ color: theme.colors.textMuted }}>{t('common:messages.loading', { defaultValue: 'Chargement…' })}</p>}

        {enabled === false && !setup && (
          <>
            <p style={{ marginTop: 0, fontSize: theme.font.sizeSm, color: theme.colors.textMuted }}>
              Ajoute un deuxième facteur d'authentification via une application comme Google Authenticator, Authy, 1Password ou Bitwarden. Bloque 99 % des prises de compte.
            </p>
            <button style={buttonStyles.primary} onClick={handleBeginSetup} disabled={busy}>
              Activer le 2FA
            </button>
          </>
        )}

        {enabled === false && setup && (
          <div>
            <p style={{ marginTop: 0, fontSize: theme.font.sizeSm }}>
              1. Scanne ce QR code dans ton application d'authentification :
            </p>
            <div
              style={{
                background: '#fff',
                padding: 12,
                border: `1px solid ${theme.colors.border}`,
                borderRadius: 6,
                display: 'inline-block',
                marginBottom: 12,
              }}
            >
              <QRCodeSVG value={setup.otpauthUrl} size={180} />
            </div>
            <details style={{ marginBottom: 12 }}>
              <summary style={{ cursor: 'pointer', fontSize: 12, color: theme.colors.textMuted }}>
                Ou entre le secret manuellement
              </summary>
              <code
                style={{
                  display: 'block',
                  marginTop: 6,
                  padding: 8,
                  background: theme.colors.surfaceAlt,
                  borderRadius: 4,
                  fontFamily: 'monospace',
                  fontSize: 12,
                  wordBreak: 'break-all',
                }}
              >
                {setup.secret}
              </code>
            </details>

            <div
              style={{
                padding: 12,
                background: 'var(--c-warningLight)',
                border: '1px solid #fbbf24',
                borderRadius: 6,
                marginBottom: 12,
              }}
            >
              <div style={{ fontWeight: 600, marginBottom: 6, fontSize: 13 }}>
                ⚠️ Codes de secours — enregistre-les maintenant, ils ne seront plus jamais montrés
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, 1fr)',
                  gap: 4,
                  fontFamily: 'monospace',
                  fontSize: 12,
                }}
              >
                {setup.backupCodes.map((c) => (
                  <span key={c}>{c}</span>
                ))}
              </div>
              <button
                style={{ ...buttonStyles.secondary, marginTop: 8, fontSize: 12 }}
                onClick={() => {
                  navigator.clipboard.writeText(setup.backupCodes.join('\n'));
                  toast.success('Codes copiés');
                }}
              >
                📋 Copier tous les codes
              </button>
            </div>

            <p style={{ fontSize: theme.font.sizeSm, marginBottom: 6 }}>
              2. Entre le code à 6 chiffres généré par ton application :
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="123456"
                maxLength={6}
                style={{
                  ...formStyles.input,
                  fontFamily: 'monospace',
                  fontSize: 20,
                  letterSpacing: 4,
                  textAlign: 'center',
                  maxWidth: 160,
                }}
              />
              <button
                style={buttonStyles.primary}
                onClick={handleEnable}
                disabled={busy || code.length !== 6}
              >
                Confirmer
              </button>
              <button
                style={buttonStyles.secondary}
                onClick={() => {
                  setSetup(null);
                  setCode('');
                }}
                disabled={busy}
              >
                Annuler
              </button>
            </div>
          </div>
        )}

        {enabled === true && !disableOpen && (
          <>
            <p style={{ marginTop: 0, fontSize: theme.font.sizeSm }}>
              ✅ 2FA activé. Un code sera demandé à chaque connexion.
            </p>
            <button style={buttonStyles.secondary} onClick={() => setDisableOpen(true)}>
              Désactiver le 2FA
            </button>
          </>
        )}

        {enabled === true && disableOpen && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 320 }}>
            <p style={{ fontSize: theme.font.sizeSm, marginTop: 0 }}>
              Confirme avec ton mot de passe + un code TOTP (ou un code de secours) :
            </p>
            <input
              type="password"
              value={disablePwd}
              onChange={(e) => setDisablePwd(e.target.value)}
              placeholder="Mot de passe actuel"
              style={formStyles.input}
            />
            <input
              value={disableCode}
              onChange={(e) => setDisableCode(e.target.value)}
              placeholder="Code TOTP (6 chiffres) ou code de secours"
              style={formStyles.input}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                style={{ ...buttonStyles.primary, background: theme.colors.danger }}
                onClick={handleDisable}
                disabled={busy || !disablePwd || !disableCode}
              >
                Désactiver
              </button>
              <button
                style={buttonStyles.secondary}
                onClick={() => setDisableOpen(false)}
                disabled={busy}
              >
                Annuler
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function extractErr(err: unknown): string {
  const ax = err as { response?: { data?: { message?: string | string[] } } };
  const m = ax?.response?.data?.message;
  if (Array.isArray(m)) return m.join(' · ');
  if (typeof m === 'string') return m;
  return err instanceof Error ? err.message : 'Erreur inconnue';
}
