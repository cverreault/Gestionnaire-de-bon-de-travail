import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import AddressAutocomplete from './AddressAutocomplete';
import CoordinatesInput from './CoordinatesInput';
import { useAddDeparturePoint, useRemoveDeparturePoint, useTenantSettings, useUpdateTenantSettings } from '../hooks/useSettings';
import { theme, buttonStyles, formStyles } from '../theme';

/**
 * B48 / B49.2 — Paramètres → Entreprise : the address that receives every completed
 * job, and the predefined departure points offered when computing a job's mileage.
 */
export default function CompanySettingsSection() {
  const { t } = useTranslation('settings');
  const { data, isLoading } = useTenantSettings();
  const update = useUpdateTenantSettings();
  const addPoint = useAddDeparturePoint();
  const removePoint = useRemoveDeparturePoint();
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  const [picked, setPicked] = useState<{ address: string; lat: number; lng: number } | null>(null);

  useEffect(() => {
    if (data) setEmail(data.completedJobsEmail ?? '');
  }, [data]);

  function saveEmail() {
    setMsg(null);
    update.mutate(
      { completedJobsEmail: email.trim() || null },
      {
        onSuccess: () => setMsg(t('company.saved', { defaultValue: 'Réglages enregistrés.' })),
        onError: () => setMsg(t('company.error', { defaultValue: "Impossible d'enregistrer. Vérifiez le courriel." })),
      },
    );
  }

  function submitPoint() {
    if (!picked || !label.trim()) return;
    addPoint.mutate({ label: label.trim(), address: picked.address, lat: picked.lat, lng: picked.lng }, { onSuccess: () => { setLabel(''); setPicked(null); } });
  }

  return (
    <div style={{ background: theme.colors.surface, border: theme.borders.default, borderRadius: theme.radius.lg, boxShadow: theme.shadows.sm, overflow: 'hidden', marginBottom: '2rem' }}>
      <div style={{ padding: '1rem 1.25rem', borderBottom: theme.borders.default, background: theme.colors.surfaceAlt }}>
        <h2 style={{ margin: 0, fontSize: theme.font.sizeLg, fontWeight: theme.font.weightSemibold, color: theme.colors.text }}>
          🏢 {t('company.title', { defaultValue: 'Entreprise' })}
        </h2>
        <p style={{ margin: '0.125rem 0 0', fontSize: theme.font.sizeXs, color: theme.colors.textMuted }}>
          {t('company.subtitle', { defaultValue: 'Courriel des travaux complétés et points de départ pour le kilométrage.' })}
        </p>
      </div>
      <div style={{ padding: '1.25rem', display: 'grid', gap: '1.25rem', maxWidth: 760 }}>
        {data && !data.emailConfigured && (
          <div style={{ background: theme.colors.warningLight, color: 'var(--c-warningBadgeText)', border: '1px solid var(--c-warningBadgeBorder)', borderRadius: theme.radius.md, padding: '0.6rem 0.9rem', fontSize: theme.font.sizeSm }}>
            {t('company.smtpMissing', { defaultValue: "L'envoi de courriels n'est pas encore configuré sur le serveur (SMTP). Les courriels sont enregistrés dans le journal du serveur jusqu'à ce que ce soit fait." })}
          </div>
        )}

        <div>
          <label htmlFor="company-email" style={{ ...formStyles.label }}>{t('company.completedJobsEmail', { defaultValue: 'Courriel qui reçoit chaque travail complété' })}</label>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <input id="company-email" type="email" style={{ ...formStyles.input, maxWidth: 360 }} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="travaux@entreprise.com" disabled={isLoading} />
            <button type="button" onClick={saveEmail} disabled={update.isPending || isLoading} style={{ ...buttonStyles.primary }}>
              {update.isPending ? t('company.saving', { defaultValue: 'Enregistrement…' }) : t('company.save', { defaultValue: 'Enregistrer' })}
            </button>
            {msg && <span style={{ fontSize: theme.font.sizeSm, color: theme.colors.textMuted }}>{msg}</span>}
          </div>
          <p style={{ margin: '0.25rem 0 0', fontSize: theme.font.sizeXs, color: theme.colors.textMuted }}>
            {t('company.completedJobsEmailHint', { defaultValue: 'Résumé envoyé à chaque bon de travail complété ou terminé en échec : client, adresse, technicien, heures, notes, pièces, signatures. Vide = aucun envoi.' })}
          </p>
        </div>

        <div>
          <label style={{ ...formStyles.label }}>{t('company.departurePoints', { defaultValue: 'Points de départ pour le kilométrage' })}</label>
          <p style={{ margin: '0 0 0.5rem', fontSize: theme.font.sizeXs, color: theme.colors.textMuted }}>
            {t('company.departurePointsHint', { defaultValue: "Proposés dans la liste déroulante quand on calcule le kilométrage d'un BT (bureau, entrepôt, dépôt…). La position GPS du technicien reste toujours disponible." })}
          </p>
          {(data?.departurePoints ?? []).length > 0 && (
            <ul style={{ listStyle: 'none', margin: '0 0 0.75rem', padding: 0, display: 'grid', gap: '0.35rem' }}>
              {(data?.departurePoints ?? []).map((p) => (
                <li key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', border: `1px solid ${theme.colors.border}`, borderRadius: theme.radius.md, padding: '0.45rem 0.75rem', fontSize: theme.font.sizeSm }}>
                  <span style={{ fontWeight: theme.font.weightSemibold }}>{p.label}</span>
                  <span style={{ flex: 1, color: theme.colors.textMuted }}>{p.address}</span>
                  <button type="button" onClick={() => { if (window.confirm(t('company.removePointConfirm', { defaultValue: 'Retirer « {{label}} » ?', label: p.label }))) removePoint.mutate(p.id); }} style={{ ...buttonStyles.ghost, color: theme.colors.danger, fontSize: theme.font.sizeXs }}>
                    🗑 {t('company.remove', { defaultValue: 'Retirer' })}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div style={{ display: 'grid', gap: '0.5rem', border: theme.borders.light, borderRadius: theme.radius.md, padding: '0.75rem' }}>
            <input style={{ ...formStyles.input, maxWidth: 280 }} value={label} onChange={(e) => setLabel(e.target.value)} placeholder={t('company.pointLabelPlaceholder', { defaultValue: 'Nom du point (ex. : Entrepôt)' })} />
            <AddressAutocomplete
              onSelect={(a) => setPicked({ address: [[a.streetNumber, a.street].filter(Boolean).join(' '), a.city, a.postalCode].filter(Boolean).join(', '), lat: a.latitude, lng: a.longitude })}
            />
            <input style={{ ...formStyles.input }} value={picked?.address ?? ''} onChange={(e) => setPicked((p) => ({ address: e.target.value, lat: p?.lat ?? NaN, lng: p?.lng ?? NaN }))} placeholder={t('company.addressPlaceholder', { defaultValue: 'Adresse (choisie ci-dessus ou saisie)' })} />
            <CoordinatesInput
              latitude={picked && Number.isFinite(picked.lat) ? picked.lat : null}
              longitude={picked && Number.isFinite(picked.lng) ? picked.lng : null}
              onChange={({ latitude, longitude }) => setPicked((p) => ({ address: p?.address ?? '', lat: latitude ?? NaN, lng: longitude ?? NaN }))}
              compact
            />
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: theme.font.sizeXs, color: picked && Number.isFinite(picked.lat) ? theme.colors.success : theme.colors.textMuted, flex: 1 }}>
                {picked && Number.isFinite(picked.lat) ? t('company.pointReady', { defaultValue: 'Position connue : le point peut être ajouté.' }) : t('company.pickAddress', { defaultValue: 'Choisissez une adresse dans les suggestions, saisissez les coordonnées ou utilisez « Ma position ».' })}
              </span>
              <button type="button" disabled={!picked || !Number.isFinite(picked.lat) || !Number.isFinite(picked.lng) || !picked.address.trim() || !label.trim() || addPoint.isPending} onClick={submitPoint} style={{ ...buttonStyles.secondary, fontSize: theme.font.sizeSm }}>
                + {t('company.addPoint', { defaultValue: 'Ajouter le point' })}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
