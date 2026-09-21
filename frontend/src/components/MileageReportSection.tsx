import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { downloadFile, getTravelReport } from '../services/work-orders.service';
import { useTechnicians } from '../hooks/useUsers';
import { theme, buttonStyles, cardStyles, tableStyles, formStyles } from '../theme';

interface Props {
  /** ISO datetimes already applied by the page filters. */
  from?: string;
  to?: string;
}

/** B49 — mileage of the completed work orders in the period, per technician, with CSV export. */
export default function MileageReportSection({ from, to }: Props) {
  const { t } = useTranslation('reports');
  const [technicianId, setTechnicianId] = useState<string>('');
  const { data: technicians = [] } = useTechnicians();
  const enabled = !!from && !!to;
  const q = useQuery({
    queryKey: ['reports', 'mileage', from, to, technicianId],
    queryFn: () => getTravelReport(from as string, to as string, technicianId || undefined).then((r) => r.data.data),
    enabled,
  });
  const report = q.data;

  return (
    <div style={{ ...cardStyles.card, marginTop: 24 }}>
      <div style={{ ...cardStyles.cardHeader, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ ...cardStyles.cardTitle }}>🚗 {t('mileage.title', { defaultValue: 'Kilométrage' })}</h2>
          <p style={{ margin: '2px 0 0', fontSize: 12, color: theme.colors.textMuted }}>
            {t('mileage.subtitle', { defaultValue: 'Aller-retour départ → site → départ des BT terminés dans la période, calculé par le moteur de routage ou saisi.' })}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select value={technicianId} onChange={(e) => setTechnicianId(e.target.value)} style={{ ...formStyles.select, width: 'auto' }}>
            <option value="">{t('mileage.allTechnicians', { defaultValue: 'Tous les techniciens' })}</option>
            {technicians.map((u) => <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>)}
          </select>
          <button
            type="button"
            disabled={!enabled}
            onClick={() => void downloadFile('/work-orders/travel-report.csv', { from: from as string, to: to as string, ...(technicianId ? { technicianId } : {}) }, 'kilometrage.csv')}
            style={{ ...buttonStyles.secondary, fontSize: theme.font.sizeSm }}
          >
            ⬇ {t('mileage.exportCsv', { defaultValue: 'Exporter CSV' })}
          </button>
        </div>
      </div>
      <div style={{ ...cardStyles.cardBody }}>
        {!enabled && <p style={{ margin: 0, color: theme.colors.textMuted, fontSize: 13 }}>{t('mileage.pickPeriod', { defaultValue: 'Choisissez une période.' })}</p>}
        {q.isLoading && <p style={{ margin: 0, color: theme.colors.textMuted, fontSize: 13 }}>…</p>}
        {report && report.technicians.length === 0 && <p style={{ margin: 0, color: theme.colors.textMuted, fontSize: 13 }}>{t('mileage.empty', { defaultValue: 'Aucun BT terminé dans la période.' })}</p>}
        {report && report.technicians.length > 0 && (
          <>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 0 }}>
              <thead style={{ ...tableStyles.header }}>
                <tr>
                  <th style={{ ...tableStyles.headerCell }}>{t('mileage.technician', { defaultValue: 'Technicien' })}</th>
                  <th style={{ ...tableStyles.headerCell, textAlign: 'right' }}>{t('mileage.workOrders', { defaultValue: 'BT terminés' })}</th>
                  <th style={{ ...tableStyles.headerCell, textAlign: 'right' }}>{t('mileage.withMileage', { defaultValue: 'Avec km' })}</th>
                  <th style={{ ...tableStyles.headerCell, textAlign: 'right' }}>{t('mileage.km', { defaultValue: 'Km aller-retour' })}</th>
                  <th style={{ ...tableStyles.headerCell, textAlign: 'right' }}>{t('mileage.hours', { defaultValue: 'Heures de route' })}</th>
                </tr>
              </thead>
              <tbody>
                {report.technicians.map((r) => (
                  <tr key={r.technicianId ?? '—'}>
                    <td style={{ ...tableStyles.cell }}>{r.technician}</td>
                    <td style={{ ...tableStyles.cell, textAlign: 'right' }}>{r.workOrders}</td>
                    <td style={{ ...tableStyles.cell, textAlign: 'right' }}>{r.withMileage}</td>
                    <td style={{ ...tableStyles.cell, textAlign: 'right', fontWeight: theme.font.weightSemibold }}>{r.distanceKm}</td>
                    <td style={{ ...tableStyles.cell, textAlign: 'right' }}>{(r.durationMin / 60).toFixed(1)}</td>
                  </tr>
                ))}
                <tr>
                  <td style={{ ...tableStyles.cell, fontWeight: theme.font.weightBold }}>{t('mileage.total', { defaultValue: 'Total' })}</td>
                  <td style={{ ...tableStyles.cell, textAlign: 'right', fontWeight: theme.font.weightBold }}>{report.items.length}</td>
                  <td style={{ ...tableStyles.cell, textAlign: 'right' }}>{report.items.filter((i) => i.distanceKm != null).length}</td>
                  <td style={{ ...tableStyles.cell, textAlign: 'right', fontWeight: theme.font.weightBold }}>{report.totalDistanceKm}</td>
                  <td style={{ ...tableStyles.cell, textAlign: 'right' }}>{(report.technicians.reduce((a, r) => a + r.durationMin, 0) / 60).toFixed(1)}</td>
                </tr>
              </tbody>
            </table>
            <p style={{ margin: '8px 0 0', fontSize: 12, color: theme.colors.textMuted }}>
              {t('mileage.hint', { defaultValue: "Le CSV liste chaque BT (référence, client, adresse, date, km, minutes, source). Les BT sans km n'ont pas d'adresse géocodée ou l'adresse de départ n'était pas définie : « Recalculer » sur le BT les complète." })}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
