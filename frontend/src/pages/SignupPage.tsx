import { useState, FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { theme, cardStyles, formStyles, buttonStyles, layoutStyles } from '../theme';
import { signup } from '../services/signup.service';

/**
 * Public signup page (B6.7 backend / B6.12 frontend).
 *
 * Creates a new workspace + first ADMIN in one POST. On success
 * shows the per-tenant subdomain link the user should bookmark and
 * a "go to my space" CTA that navigates to /login.
 */
export default function SignupPage() {
  const { t } = useTranslation('onboarding');
  const navigate = useNavigate();
  const [form, setForm] = useState({
    slug: '',
    organizationName: '',
    email: '',
    password: '',
    firstName: '',
    lastName: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<{ slug: string; name: string } | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const { tenant } = await signup(form);
      setCreated({ slug: tenant.slug, name: tenant.name });
    } catch (err: unknown) {
      const msg =
        typeof err === 'object' && err !== null && 'response' in err
          ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ((err as any).response?.data?.message as string | undefined)
          : undefined;
      setError(msg ?? t('onboarding:signup.unexpectedError', { defaultValue: 'Erreur inattendue. Réessayez plus tard.' }));
    } finally {
      setSubmitting(false);
    }
  };

  if (created) {
    return (
      <div style={{ ...layoutStyles.page, display: 'flex', justifyContent: 'center' }}>
        <div style={{ ...cardStyles.card, maxWidth: 480, marginTop: 80, padding: 32 }}>
          <h1 style={{ color: theme.colors.primary, margin: '0 0 12px' }}>🎉 {t('onboarding:signup.spaceCreatedTitle', { defaultValue: 'Espace créé' })}</h1>
          <p style={{ color: theme.colors.text, lineHeight: 1.6 }}>
            {t('onboarding:signup.spaceOnlinePrefix', { defaultValue: 'Votre espace' })}{' '}
            <strong>{created.name}</strong>{' '}
            {t('onboarding:signup.spaceOnlineSuffix', { defaultValue: 'est en ligne. Vous pouvez maintenant vous connecter sur :' })}
          </p>
          <p style={{ background: theme.colors.surfaceAlt, padding: 12, borderRadius: 4, fontFamily: 'monospace' }}>
            {created.slug}.taskmgr.com
          </p>
          <p style={{ color: theme.colors.textMuted, fontSize: 13 }}>
            {t('onboarding:signup.devSubdomainHint', { defaultValue: 'Pour le moment (dev), accédez à votre espace via le sous-domaine de cet hôte.' })}
          </p>
          <button
            onClick={() => navigate('/login')}
            style={{ ...buttonStyles.primary, marginTop: 16 }}
          >
            {t('onboarding:signup.goToLogin', { defaultValue: 'Aller à la connexion' })} →
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ ...layoutStyles.page, display: 'flex', justifyContent: 'center' }}>
      <form
        onSubmit={handleSubmit}
        style={{ ...cardStyles.card, maxWidth: 480, marginTop: 40, padding: 32, display: 'flex', flexDirection: 'column', gap: 12 }}
      >
        <h1 style={{ margin: '0 0 4px', color: theme.colors.primary }}>{t('onboarding:signup.createSpaceTitle', { defaultValue: 'Créer un espace' })}</h1>
        <p style={{ margin: '0 0 12px', color: theme.colors.textMuted, fontSize: 13 }}>
          {t('onboarding:signup.freeToStart', { defaultValue: 'Tout est gratuit pour commencer — passez à PRO plus tard si besoin.' })}
        </p>

        <Field label={t('onboarding:signup.slugLabel', { defaultValue: 'Identifiant URL (slug)' })} hint={t('onboarding:signup.slugHint', { defaultValue: '3-20 caractères, minuscules + chiffres + tirets' })}>
          <input
            required
            value={form.slug}
            onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase() })}
            style={formStyles.input}
            placeholder={t('onboarding:signup.slugPlaceholder', { defaultValue: 'ex: campingpleinbois' })}
          />
        </Field>

        <Field label={t('onboarding:signup.orgNameLabel', { defaultValue: "Nom de l'organisation" })}>
          <input
            required
            value={form.organizationName}
            onChange={(e) => setForm({ ...form, organizationName: e.target.value })}
            style={formStyles.input}
            placeholder={t('onboarding:signup.orgNamePlaceholder', { defaultValue: 'ex: Camping Plein Bois' })}
          />
        </Field>

        <div style={{ display: 'flex', gap: 12 }}>
          <Field label={t('onboarding:signup.firstNameLabel', { defaultValue: 'Prénom' })} style={{ flex: 1 }}>
            <input
              required
              value={form.firstName}
              onChange={(e) => setForm({ ...form, firstName: e.target.value })}
              style={formStyles.input}
            />
          </Field>
          <Field label={t('onboarding:signup.lastNameLabel', { defaultValue: 'Nom' })} style={{ flex: 1 }}>
            <input
              required
              value={form.lastName}
              onChange={(e) => setForm({ ...form, lastName: e.target.value })}
              style={formStyles.input}
            />
          </Field>
        </div>

        <Field label={t('onboarding:signup.adminEmailLabel', { defaultValue: 'Email administrateur' })}>
          <input
            type="email"
            required
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            style={formStyles.input}
          />
        </Field>

        <Field label={t('onboarding:signup.passwordLabel', { defaultValue: 'Mot de passe' })} hint={t('onboarding:signup.passwordHint', { defaultValue: 'Minimum 8 caractères' })}>
          <input
            type="password"
            required
            minLength={8}
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            style={formStyles.input}
          />
        </Field>

        {error && (
          <p style={{ color: theme.colors.danger, margin: 0, fontSize: 13 }} role="alert">
            {error}
          </p>
        )}

        <button type="submit" disabled={submitting} style={buttonStyles.primary}>
          {submitting ? t('onboarding:signup.creating', { defaultValue: 'Création…' }) : t('onboarding:signup.createMySpace', { defaultValue: 'Créer mon espace' })}
        </button>

        <p style={{ textAlign: 'center', fontSize: 13, color: theme.colors.textMuted, margin: '8px 0 0' }}>
          {t('onboarding:signup.alreadyHaveAccount', { defaultValue: 'Vous avez déjà un compte ?' })}{' '}
          <Link to="/login" style={{ color: theme.colors.primary }}>
            {t('onboarding:signup.signIn', { defaultValue: 'Se connecter' })}
          </Link>
        </p>
        <p style={{ textAlign: 'center', fontSize: 11, marginTop: 4 }}>
          <a href="/confidentialite" style={{ color: theme.colors.textMuted, textDecoration: 'underline' }}>
            {t('onboarding:signup.privacyPolicy', { defaultValue: 'Politique de confidentialité / Privacy policy' })}
          </a>
        </p>
      </form>
    </div>
  );
}

interface FieldProps {
  label: string;
  hint?: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
}

function Field({ label, hint, children, style }: FieldProps) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, ...style }}>
      <span style={{ fontSize: 13, color: theme.colors.text, fontWeight: 600 }}>{label}</span>
      {children}
      {hint && (
        <span style={{ fontSize: 11, color: theme.colors.textMuted }}>{hint}</span>
      )}
    </label>
  );
}
