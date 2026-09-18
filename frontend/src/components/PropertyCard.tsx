import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { getPropertyForAddress } from '../services/geo.service';
import { theme } from '../theme';
import { currentBcp47 } from '../utils/dateFormat';

interface Props {
  addressId: string;
  /** Compact variant for the technician mobile view. */
  compact?: boolean;
}

/**
 * Fiche propriété (B40) — attributs de l'unité d'évaluation foncière qui
 * correspond à l'adresse : usage, logements, étages, année, superficies,
 * lot, matricule, valeur au rôle. Source : rôle d'évaluation MAMH (CC-BY 4.0).
 */
export default function PropertyCard({ addressId, compact }: Props) {
  const { t } = useTranslation('addresses');
  const { data, isLoading, isError } = useQuery({
    queryKey: ['geo', 'property', addressId],
    queryFn: () => getPropertyForAddress(addressId),
    staleTime: 24 * 60 * 60 * 1000,
    retry: false,
  });

  if (isLoading) {
    return <p style={{ fontSize: theme.font.sizeXs, color: theme.colors.textMuted, margin: '0.5rem 0 0' }}>
      {t('property.loading', { defaultValue: 'Recherche de la fiche propriété…' })}
    </p>;
  }
  if (isError || !data) {
    return <p style={{ fontSize: theme.font.sizeXs, color: theme.colors.textMuted, margin: '0.5rem 0 0' }}>
      🏠 {t('property.notFound', { defaultValue: 'Aucune fiche propriété trouvée au rôle d’évaluation.' })}
    </p>;
  }

  const locale = currentBcp47();
  const num = (v: number | null, unit = '') => (v === null ? '—' : `${v.toLocaleString(locale)}${unit}`);
  const money = (v: number | null) =>
    v === null ? '—' : v.toLocaleString(locale, { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 });

  const rows: Array<[string, string]> = [
    [t('property.usage', { defaultValue: 'Usage' }), data.landUseLabel ?? data.landUseCode ?? '—'],
    [t('property.dwellings', { defaultValue: 'Logements' }), num(data.dwellings)],
    [t('property.storeys', { defaultValue: 'Étages' }), num(data.storeys)],
    [t('property.yearBuilt', { defaultValue: 'Construction' }), data.yearBuilt ? String(data.yearBuilt) : '—'],
    [t('property.landArea', { defaultValue: 'Terrain' }), num(data.landAreaM2, ' m²')],
    [t('property.floorArea', { defaultValue: 'Aire de plancher' }), num(data.floorAreaM2, ' m²')],
    [t('property.lot', { defaultValue: 'Lot(s)' }), data.lotNumbers.length ? data.lotNumbers.join(', ') : '—'],
    [t('property.matricule', { defaultValue: 'Matricule' }), data.matricule],
    [t('property.value', { defaultValue: 'Valeur au rôle' }), `${money(data.valueTotal)} (${t('property.valueDetail', { defaultValue: 'terrain {{land}}, bâtiment {{building}}', land: money(data.valueLand), building: money(data.valueBuilding) })})`],
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
          🏠 {t('property.title', { defaultValue: 'Fiche propriété' })} · {data.address}, {data.municipality}
        </strong>
        <span style={{ fontSize: theme.font.sizeXs, color: theme.colors.textMuted }}>
          {data.matchedBy === 'nearest'
            ? t('property.matchedNearest', { defaultValue: 'unité la plus proche ({{m}} m)', m: data.distanceMeters ?? '?' })
            : t('property.matchedExact', { defaultValue: 'correspondance numéro + rue' })}
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
        {t('property.source', { defaultValue: 'Source : rôle d’évaluation foncière {{year}} (MAMH, données ouvertes CC-BY 4.0)', year: data.rollYear })}
      </p>
    </div>
  );
}
