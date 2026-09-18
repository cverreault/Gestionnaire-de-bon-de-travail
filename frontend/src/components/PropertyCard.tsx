import { useTranslation } from 'react-i18next';
import type { ClientAddress } from '../types';
import { useAuthStore } from '../context/auth.store';
import { useRefreshAddressGeo } from '../hooks/useClients';
import { theme, buttonStyles } from '../theme';
import { currentBcp47 } from '../utils/dateFormat';

interface Props {
  address: ClientAddress;
  /** Compact variant for the technician mobile view. */
  compact?: boolean;
}

/**
 * Fiche propriété (B40.2) — attributs de l'unité d'évaluation foncière copiés
 * sur l'adresse au géocodage : usage, logements, étages, année, superficies,
 * lot, matricule, valeur au rôle. Source : rôle d'évaluation MAMH (CC-BY 4.0).
 * Admin et dispatcher peuvent forcer une nouvelle recherche.
 */
export default function PropertyCard({ address, compact }: Props) {
  const { t } = useTranslation('addresses');
  const role = useAuthStore((s) => s.user?.role);
  const canRefresh = role === 'ADMIN' || role === 'DISPATCHER';
  const refresh = useRefreshAddressGeo();

  const refreshButton = canRefresh ? (
    <button
      type="button"
      onClick={() => refresh.mutate(address.id)}
      disabled={refresh.isPending}
      style={{ ...buttonStyles.secondary, padding: '2px 8px', fontSize: theme.font.sizeXs }}
    >
      {refresh.isPending
        ? t('property.refreshing', { defaultValue: 'Actualisation…' })
        : t('property.refresh', { defaultValue: '↻ Actualiser' })}
    </button>
  ) : null;

  if (!address.propertyMatchedBy) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
        <span style={{ fontSize: theme.font.sizeXs, color: theme.colors.textMuted }}>
          🏠 {address.propertyMatchedAt
            ? t('property.notFound', { defaultValue: 'Aucune fiche propriété trouvée au rôle d’évaluation.' })
            : t('property.pending', { defaultValue: 'Fiche propriété en attente de géocodage.' })}
        </span>
        {refreshButton}
      </div>
    );
  }

  const locale = currentBcp47();
  const num = (v: number | null | undefined, unit = '') => (v == null ? '—' : `${v.toLocaleString(locale)}${unit}`);
  const money = (v: number | null | undefined) =>
    v == null ? '—' : v.toLocaleString(locale, { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 });

  const rows: Array<[string, string]> = [
    [t('property.usage', { defaultValue: 'Usage' }), address.propertyLandUseLabel ?? address.propertyLandUseCode ?? '—'],
    [t('property.dwellings', { defaultValue: 'Logements' }), num(address.propertyDwellings)],
    [t('property.storeys', { defaultValue: 'Étages' }), num(address.propertyStoreys)],
    [t('property.yearBuilt', { defaultValue: 'Construction' }), address.propertyYearBuilt ? String(address.propertyYearBuilt) : '—'],
    [t('property.landArea', { defaultValue: 'Terrain' }), num(address.propertyLandAreaM2, ' m²')],
    [t('property.floorArea', { defaultValue: 'Aire de plancher' }), num(address.propertyFloorAreaM2, ' m²')],
    [t('property.lot', { defaultValue: 'Lot(s)' }), address.propertyLotNumbers ?? '—'],
    [t('property.matricule', { defaultValue: 'Matricule' }), address.propertyMatricule ?? '—'],
    [t('property.value', { defaultValue: 'Valeur au rôle' }), `${money(address.propertyValueTotal)} (${t('property.valueDetail', { defaultValue: 'terrain {{land}}, bâtiment {{building}}', land: money(address.propertyValueLand), building: money(address.propertyValueBuilding) })})`],
  ];

  return (
    <div
      style={{
        marginTop: '0.75rem',
        padding: compact ? '0.6rem 0.75rem' : '0.75rem 1rem',
        background: theme.colors.surfaceAlt,
        border: theme.borders.default,
        borderRadius: theme.radius.md,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '0.5rem', flexWrap: 'wrap' }}>
        <strong style={{ fontSize: theme.font.sizeSm, color: theme.colors.text }}>
          🏠 {t('property.title', { defaultValue: 'Fiche propriété' })} · {address.propertyAddress}, {address.propertyMunicipality}
        </strong>
        <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: theme.font.sizeXs, color: theme.colors.textMuted }}>
          {address.propertyMatchedBy === 'nearest'
            ? t('property.matchedNearestShort', { defaultValue: 'unité la plus proche' })
            : t('property.matchedExact', { defaultValue: 'correspondance numéro + rue' })}
          {refreshButton}
        </span>
      </div>
      <dl
        style={{
          display: 'grid',
          gridTemplateColumns: compact ? '1fr' : 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))',
          gap: compact ? '0.2rem 0.75rem' : '0.35rem 1rem',
          margin: '0.5rem 0 0',
          fontSize: theme.font.sizeSm,
        }}
      >
        {rows.map(([label, value]) => (
          <div key={label} style={{ display: 'flex', gap: '0.4rem', minWidth: 0 }}>
            <dt style={{ color: theme.colors.textMuted, whiteSpace: 'nowrap' }}>{label}</dt>
            <dd style={{ margin: 0, color: theme.colors.text, overflowWrap: 'anywhere' }}>{value}</dd>
          </div>
        ))}
      </dl>
      <p style={{ margin: '0.5rem 0 0', fontSize: theme.font.sizeXs, color: theme.colors.textMuted }}>
        {t('property.source', { defaultValue: 'Source : rôle d’évaluation foncière {{year}} (MAMH, données ouvertes CC-BY 4.0)', year: address.propertyRollYear ?? '' })}
        {address.geocodeSource && ` · ${t('property.geocodeSource', { defaultValue: 'GPS : {{source}}', source: address.geocodeSource === 'adresses-quebec' ? 'Adresses Québec' : 'OpenStreetMap' })}`}
      </p>
    </div>
  );
}
