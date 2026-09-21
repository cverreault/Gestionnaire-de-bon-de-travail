import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { theme, buttonStyles, formStyles } from '../theme';

interface Props {
  latitude: number | null | undefined;
  longitude: number | null | undefined;
  onChange: (next: { latitude: number | null; longitude: number | null }) => void;
  disabled?: boolean;
  compact?: boolean;
}

const LAT_RE = /^-?\d{1,2}(\.\d+)?$/;
const LNG_RE = /^-?\d{1,3}(\.\d+)?$/;

/**
 * B53 — GPS coordinates in decimal degrees : typed by hand (lat, lng) or
 * filled from the device position (browser geolocation). Shared by every
 * form that carries a position (addresses, departure points).
 */
export default function CoordinatesInput({ latitude, longitude, onChange, disabled, compact }: Props) {
  const { t } = useTranslation('common');
  const [latText, setLatText] = useState(latitude != null ? String(latitude) : '');
  const [lngText, setLngText] = useState(longitude != null ? String(longitude) : '');
  const [lastSynced, setLastSynced] = useState<string>(`${latitude ?? ''}|${longitude ?? ''}`);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Keep the text fields in sync when the parent sets coordinates (autocomplete, reset).
  const key = `${latitude ?? ''}|${longitude ?? ''}`;
  if (key !== lastSynced) {
    setLastSynced(key);
    setLatText(latitude != null ? String(latitude) : '');
    setLngText(longitude != null ? String(longitude) : '');
  }

  function commit(latStr: string, lngStr: string) {
    const lat = latStr.trim().replace(',', '.');
    const lng = lngStr.trim().replace(',', '.');
    if (lat === '' && lng === '') { onChange({ latitude: null, longitude: null }); setError(null); return; }
    const okLat = LAT_RE.test(lat) && Math.abs(Number(lat)) <= 90;
    const okLng = LNG_RE.test(lng) && Math.abs(Number(lng)) <= 180;
    if (!okLat || !okLng) { setError(t('coords.invalid', { defaultValue: 'Format attendu : degrés décimaux, ex. 45.4035 et -74.0512' })); return; }
    setError(null);
    onChange({ latitude: Math.round(Number(lat) * 1e6) / 1e6, longitude: Math.round(Number(lng) * 1e6) / 1e6 });
  }

  function useDevice() {
    if (typeof navigator === 'undefined' || !navigator.geolocation) { setError(t('coords.unsupported', { defaultValue: 'Localisation non disponible dans ce navigateur.' })); return; }
    setBusy(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = Math.round(pos.coords.latitude * 1e6) / 1e6;
        const lng = Math.round(pos.coords.longitude * 1e6) / 1e6;
        setLatText(String(lat));
        setLngText(String(lng));
        setLastSynced(`${lat}|${lng}`);
        onChange({ latitude: lat, longitude: lng });
        setBusy(false);
      },
      () => { setError(t('coords.denied', { defaultValue: 'Position refusée ou indisponible. Autorisez la localisation dans le navigateur.' })); setBusy(false); },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 30_000 },
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 140px' }}>
          <label style={{ ...formStyles.label, fontSize: theme.font.sizeXs }}>{t('coords.latitude', { defaultValue: 'Latitude' })}</label>
          <input inputMode="decimal" placeholder="45.4035" value={latText} disabled={disabled} onChange={(e) => setLatText(e.target.value)} onBlur={() => commit(latText, lngText)} style={{ ...formStyles.input, fontFamily: 'monospace' }} />
        </div>
        <div style={{ flex: '1 1 140px' }}>
          <label style={{ ...formStyles.label, fontSize: theme.font.sizeXs }}>{t('coords.longitude', { defaultValue: 'Longitude' })}</label>
          <input inputMode="decimal" placeholder="-74.0512" value={lngText} disabled={disabled} onChange={(e) => setLngText(e.target.value)} onBlur={() => commit(latText, lngText)} style={{ ...formStyles.input, fontFamily: 'monospace' }} />
        </div>
        <button type="button" onClick={useDevice} disabled={disabled || busy} style={{ ...buttonStyles.secondary, fontSize: theme.font.sizeSm, whiteSpace: 'nowrap' }}>
          {busy ? '…' : `📍 ${t('coords.useDevice', { defaultValue: 'Ma position' })}`}
        </button>
      </div>
      {!compact && (
        <p style={{ margin: '0.25rem 0 0', fontSize: theme.font.sizeXs, color: error ? theme.colors.danger : theme.colors.textMuted }}>
          {error ?? t('coords.hint', { defaultValue: 'Degrés décimaux (WGS 84). « Ma position » utilise le GPS de votre appareil.' })}
        </p>
      )}
      {compact && error && <p style={{ margin: '0.25rem 0 0', fontSize: theme.font.sizeXs, color: theme.colors.danger }}>{error}</p>}
    </div>
  );
}
