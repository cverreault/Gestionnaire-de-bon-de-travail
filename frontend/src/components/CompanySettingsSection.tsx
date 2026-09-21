import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import AddressAutocomplete from './AddressAutocomplete';
import { useTenantSettings, useUpdateTenantSettings } from '../hooks/useSettings';
import { theme, buttonStyles, formStyles } from '../theme';

/**
 * B48 — Paramètres → Entreprise : the address that receives every completed
 * job, and the technicians' starting address (round-trip mileage).
 */
export default function CompanySettingsSection() {
  const { t } = useTranslation('settings');
  const { data, isLoading } = useTenantSettings();
  const update = useUpdateTenantSettings();
  const [email, setEmail] = useState('');
  const [baseAddress, setBaseAddress] = useState('');
  const [base, setBase] = useState<{ lat: number | null; lng: number | null }>({ lat: null, lng: null });
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!data) return;
    setEmail(data.completedJobsEmail ?? '');
    setBaseAddress(data.baseAddress ?? '');
    setBase({ lat: data.baseLat, lng: data.baseLng });
  }, [data]);

  function save() {
    setMsg(null);
    update.mutate(
      { completedJobsEmail: email.trim() || null, baseAddress: baseAddress.trim() || null, baseLat: baseAddress.trim() ? base.lat : null, baseLng: baseAddress.trim() ? base.lng : null },
      {
        onSuccess: () => setMsg(t('company.saved', { defaultValue: 'Réglages enregistrés.' })),
        onError: () => setMsg(t('company.error', { defaultValue: "Impossible d'enregistrer. Vérifiez le courriel." })),
      },
    );
  }

  return (
    <div style={{ background: theme.colors.surface, border: theme.borders.default, borderRadius: theme.radius.lg, boxShadow: theme.shadows.sm, overflow: 'hidden', marginBottom: '2rem' }}>
      <div style={{ padding: '1rem 1.25rem', borderBottom: theme.borders.default, background: theme.colors.surfaceAlt }}>
        <h2 style={{ margin: 0, fontSize: theme.font.sizeLg, fontWeight: theme.font.weightSemibold, color: theme.colors.text }}>
          🏢 {t('company.title', { defaultValue: 'Entreprise' })}
        </h2>
        <p style={{ margin: '0.125rem 0 0', fontSize: theme.font.sizeXs, color: theme.colors.textMuted }}>
          {t('company.subtitle', { defaultValue: 'Courriel des travaux complétés et adresse de départ des techniciens.' })}
        </p>
      </div>
      <div style={{ padding: '1.25rem', display: 'grid', gap: '1rem', maxWidth: 720 }}>
        {data && !data.emailConfigured && (
          <div style={{ background: theme.colors.warningLight, color: 'var(--c-warningBadgeText)', border: '1px solid var(--c-warningBadgeBorder)', borderRadius: theme.radius.md, padding: '0.6rem 0.9rem', fontSize: theme.font.sizeSm }}>
            {t('company.smtpMissing', { defaultValue: "L'envoi de courriels n'est pas encore configuré sur le serveur (SMTP). Les courriels sont enregistrés dans le journal du serveur jusqu'à ce que ce soit fait." })}
          </div>
        )}
        <div>
          <label htmlFor="company-email" style={{ ...formStyles.label }}>{t('company.completedJobsEmail', { defaultValue: 'Courriel qui reçoit chaque travail complété' })}</label>
          <input id="company-email" type="email" style={{ ...formStyles.input }} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="travaux@entreprise.com" disabled={isLoading} />
          <p style={{ margin: '0.25rem 0 0', fontSize: theme.font.sizeXs, color: theme.colors.textMuted }}>
            {t('company.completedJobsEmailHint', { defaultValue: 'Résumé envoyé à chaque bon de travail complété ou terminé en échec : client, adresse, technicien, heures, notes, pièces, signatures. Vide = aucun envoi.' })}
          </p>
        </div>
        <div>
          <label style={{ ...formStyles.label }}>{t('company.baseAddress', { defaultValue: 'Adresse de départ des techniciens (kilométrage aller-retour)' })}</label>
          <AddressAutocomplete
            onSelect={(a) => {
              const line = [[a.streetNumber, a.street].filter(Boolean).join(' '), a.city, a.postalCode].filter(Boolean).join(', ');
              setBaseAddress(line);
              setBase({ lat: a.latitude ?? null, lng: a.longitude ?? null });
            }}
          />
          <input style={{ ...formStyles.input, marginTop: '0.5rem' }} value={baseAddress} onChange={(e) => { setBaseAddress(e.target.value); setBase({ lat: null, lng: null }); }} placeholder={t('company.baseAddressPlaceholder', { defaultValue: 'Choisissez une adresse ci-dessus ou saisissez-la' })} />
          <p style={{ margin: '0.25rem 0 0', fontSize: theme.font.sizeXs, color: base.lat != null ? theme.colors.success : theme.colors.textMuted }}>
            {base.lat != null
              ? t('company.baseLocated', { defaultValue: 'Position connue ({{lat}}, {{lng}}) : le kilométrage peut être calculé.', lat: base.lat.toFixed(5), lng: base.lng?.toFixed(5) })
              : t('company.baseNotLocated', { defaultValue: 'Sans position, le kilométrage ne peut pas être calculé : choisissez une suggestion.' })}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <button type="button" onClick={save} disabled={update.isPending || isLoading} style={{ ...buttonStyles.primary }}>
            {update.isPending ? t('company.saving', { defaultValue: 'Enregistrement…' }) : t('company.save', { defaultValue: 'Enregistrer' })}
          </button>
          {msg && <span style={{ fontSize: theme.font.sizeSm, color: theme.colors.textMuted }}>{msg}</span>}
        </div>
      </div>
    </div>
  );
}
