import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { theme, cardStyles, layoutStyles, buttonStyles } from '../theme';
import {
  checkRollAvailability,
  getRollStatus,
  listRollJobs,
  startRollImport,
  type RollJob,
  type RollYearAvailability,
} from '../services/super-admin.service';
import { formatDateTime } from '../utils/dateFormat';

const STATUS_KEY = ['superAdmin', 'geo', 'status'];
const JOBS_KEY = ['superAdmin', 'geo', 'jobs'];

/**
 * SA-only — Référentiel géographique (B40.3) : état du rôle d'évaluation
 * chargé, vérification des années publiées par le MAMH, lancement d'un
 * import en arrière-plan et suivi de son journal. Adresses Québec est un
 * service en ligne : rien à mettre à jour de ce côté.
 */
export default function SuperAdminGeoPage() {
  const { t } = useTranslation('superAdmin');
  const qc = useQueryClient();
  const [years, setYears] = useState<RollYearAvailability[] | null>(null);

  const status = useQuery({
    queryKey: STATUS_KEY,
    queryFn: getRollStatus,
    refetchInterval: (q) => (q.state.data?.running ? 5_000 : false),
  });
  const jobs = useQuery({ queryKey: JOBS_KEY, queryFn: listRollJobs });

  const check = useMutation({ mutationFn: checkRollAvailability, onSuccess: setYears });
  const start = useMutation({
    mutationFn: startRollImport,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: STATUS_KEY });
      qc.invalidateQueries({ queryKey: JOBS_KEY });
    },
  });

  const s = status.data;
  const running = s?.running ?? null;
  const startError = (start.error as { response?: { data?: { message?: string } } } | undefined)?.response?.data?.message;

  return (
    <div style={layoutStyles.page}>
      <header style={{ marginBottom: 16 }}>
        <h1 style={{ margin: 0 }}>🗺️ {t('geo.title', { defaultValue: 'Référentiel d’adresses' })}</h1>
        <p style={{ color: theme.colors.textMuted, margin: '4px 0 0', fontSize: 13 }}>
          {t('geo.subtitle', { defaultValue: 'Adresses Québec (autocomplétion et GPS) est un service en ligne du MRNF, toujours à jour. Le rôle d’évaluation foncière (fiche propriété) est importé ici et publié chaque année par le MAMH.' })}
        </p>
      </header>

      {/* ── État ── */}
      <div style={{ ...cardStyles.card, padding: 24, marginBottom: 24 }}>
        <h3 style={{ margin: '0 0 12px' }}>{t('geo.currentRoll', { defaultValue: 'Rôle d’évaluation chargé' })}</h3>
        {status.isLoading ? (
          <p style={{ color: theme.colors.textMuted }}>{t('geo.loading', { defaultValue: 'Chargement…' })}</p>
        ) : s ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 12 }}>
            <Stat label={t('geo.rollYear', { defaultValue: 'Année du rôle' })} value={s.loadedRollYear ? String(s.loadedRollYear) : '—'} />
            <Stat label={t('geo.rows', { defaultValue: 'Adresses au rôle' })} value={s.rows.toLocaleString()} />
            <Stat label={t('geo.municipalities', { defaultValue: 'Municipalités' })} value={s.municipalities.toLocaleString()} />
            <Stat
              label={t('geo.lastImport', { defaultValue: 'Dernier import' })}
              value={s.lastJob ? `${formatDateTime(s.lastJob.finishedAt ?? s.lastJob.startedAt)} · ${statusLabel(t, s.lastJob.status)}` : '—'}
            />
          </div>
        ) : null}
      </div>

      {/* ── Mise à jour ── */}
      <div style={{ ...cardStyles.card, padding: 24, marginBottom: 24 }}>
        <h3 style={{ margin: '0 0 12px' }}>{t('geo.updateHeading', { defaultValue: 'Mise à jour du rôle' })}</h3>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button onClick={() => check.mutate()} disabled={check.isPending || !!running} style={buttonStyles.secondary}>
            {check.isPending
              ? t('geo.checking', { defaultValue: 'Vérification chez le MAMH…' })
              : t('geo.checkButton', { defaultValue: '🔎 Vérifier les mises à jour disponibles' })}
          </button>
          {running && (
            <span style={{ fontSize: 13, color: theme.colors.warning }}>
              ⏳ {t('geo.runningNotice', { defaultValue: 'Import du rôle {{year}} en cours…', year: running.rollYear })}
            </span>
          )}
        </div>
        {years && (
          <ul style={{ listStyle: 'none', padding: 0, margin: '16px 0 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {years.map((y) => (
              <li key={y.year} style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 14 }}>
                <strong style={{ width: 60 }}>{y.year}</strong>
                <span style={{ color: y.available ? theme.colors.success : theme.colors.textMuted }}>
                  {y.available
                    ? t('geo.available', { defaultValue: 'publié par le MAMH' })
                    : t('geo.notPublished', { defaultValue: 'pas encore publié' })}
                  {y.loaded && ` · ${t('geo.loaded', { defaultValue: 'chargé' })}`}
                </span>
                {y.available && (
                  <button
                    onClick={() => start.mutate(y.year)}
                    disabled={start.isPending || !!running}
                    style={y.loaded ? buttonStyles.secondary : buttonStyles.primary}
                  >
                    {y.loaded
                      ? t('geo.reimportButton', { defaultValue: 'Réimporter' })
                      : t('geo.importButton', { defaultValue: '⬇ Importer le rôle {{year}}', year: y.year })}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {startError && <p style={{ color: theme.colors.danger, fontSize: 13, marginTop: 12 }}>{startError}</p>}
        <p style={{ fontSize: 12, color: theme.colors.textMuted, marginTop: 16 }}>
          {t('geo.updateHint', { defaultValue: 'Un import télécharge environ 570 Mo, prend 15 à 25 minutes et remplace les données en une seule transaction : en cas d’échec, le rôle précédent reste en place. Après un import, toutes les adresses sont ré-appariées automatiquement par le balayage.' })}
        </p>
      </div>

      {/* ── Journal ── */}
      {(running ?? s?.lastJob) && <JobPanel job={(running ?? s?.lastJob) as RollJob} />}

      {/* ── Historique ── */}
      <div style={{ ...cardStyles.card, padding: 0, overflow: 'hidden', marginTop: 24 }}>
        <div style={{ padding: '12px 16px', borderBottom: `1px solid ${theme.colors.border}`, fontWeight: 600 }}>
          {t('geo.history', { defaultValue: 'Historique des imports' })}
        </div>
        {!jobs.data || jobs.data.length === 0 ? (
          <div style={{ padding: 16, color: theme.colors.textMuted }}>{t('geo.noJobs', { defaultValue: 'Aucun import lancé depuis le portail.' })}</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: theme.colors.surfaceAlt }}>
                <Th>{t('geo.colYear', { defaultValue: 'Rôle' })}</Th>
                <Th>{t('geo.colStatus', { defaultValue: 'Statut' })}</Th>
                <Th>{t('geo.colStarted', { defaultValue: 'Début' })}</Th>
                <Th>{t('geo.colFinished', { defaultValue: 'Fin' })}</Th>
                <Th>{t('geo.colRows', { defaultValue: 'Lignes' })}</Th>
              </tr>
            </thead>
            <tbody>
              {jobs.data.map((j) => (
                <tr key={j.id} style={{ borderBottom: `1px solid ${theme.colors.border}` }}>
                  <td style={cell}>{j.rollYear}</td>
                  <td style={cell}>{statusLabel(t, j.status)}{j.error ? ` — ${j.error}` : ''}</td>
                  <td style={cell}>{formatDateTime(j.startedAt)}</td>
                  <td style={cell}>{j.finishedAt ? formatDateTime(j.finishedAt) : '—'}</td>
                  <td style={cell}>{j.rowsImported?.toLocaleString() ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

const cell: React.CSSProperties = { padding: '8px 12px' };

function statusLabel(t: (k: string, o?: Record<string, unknown>) => string, status: RollJob['status']): string {
  switch (status) {
    case 'SUCCESS': return t('geo.statusSuccess', { defaultValue: '✅ Réussi' });
    case 'FAILED': return t('geo.statusFailed', { defaultValue: '❌ Échoué' });
    case 'RUNNING': return t('geo.statusRunning', { defaultValue: '⏳ En cours' });
    default: return t('geo.statusPending', { defaultValue: '🕓 En attente' });
  }
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, color: theme.colors.textMuted }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 600, color: theme.colors.text }}>{value}</div>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5, color: theme.colors.textMuted, borderBottom: `1px solid ${theme.colors.border}` }}>
      {children}
    </th>
  );
}

function JobPanel({ job }: { job: RollJob }) {
  const { t } = useTranslation('superAdmin');
  return (
    <div style={{ ...cardStyles.card, padding: 24 }}>
      <h3 style={{ margin: '0 0 8px' }}>
        {t('geo.jobHeading', { defaultValue: 'Import du rôle {{year}}', year: job.rollYear })} · {statusLabel(t, job.status)}
      </h3>
      {job.error && <p style={{ color: theme.colors.danger, fontSize: 13 }}>{job.error}</p>}
      <pre
        style={{
          margin: 0,
          padding: 12,
          maxHeight: 260,
          overflow: 'auto',
          fontSize: 12,
          background: theme.colors.surfaceAlt,
          border: `1px solid ${theme.colors.border}`,
          borderRadius: 6,
          whiteSpace: 'pre-wrap',
          color: theme.colors.text,
        }}
      >
        {job.log || t('geo.noLog', { defaultValue: '(aucune sortie pour l’instant)' })}
      </pre>
    </div>
  );
}
