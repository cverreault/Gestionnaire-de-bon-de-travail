/**
 * HTML template for the monthly report PDF.
 *
 * Aggregates the four KPI sections (resolution time, completion
 * outcome, SLA, throughput) into a single executive summary. Used
 * by the on-demand endpoint and — once the email distribution
 * lands — by the first-of-month cron.
 */

export interface MonthlyReportData {
  year: number;
  /** 1-12. */
  month: number;
  totals: {
    created: number;
    completed: number;
    completedPositive: number;
    completedNegative: number;
    slaTracked: number;
    slaBreached: number;
  };
  resolutionTime: Array<{
    taskTypeName: string | null;
    completedCount: number;
    avgResolutionHours: number;
    medianResolutionHours: number;
  }>;
  completionOutcome: Array<{
    taskTypeName: string | null;
    positive: number;
    negative: number;
    successRate: number | null;
  }>;
  sla: Array<{
    taskTypeName: string | null;
    tracked: number;
    breached: number;
    breachRate: number | null;
  }>;
}

interface Strings {
  title: string;
  period: string;
  monthNames: string[];
  summary: string;
  created: string;
  completed: string;
  successRate: string;
  slaBreachRate: string;
  resolutionTime: string;
  completionOutcome: string;
  sla: string;
  taskType: string;
  count: string;
  average: string;
  median: string;
  positive: string;
  negative: string;
  tracked: string;
  breached: string;
  untyped: string;
  noData: string;
  generated: string;
}

const STRINGS: Record<'fr' | 'en', Strings> = {
  fr: {
    title: 'Rapport mensuel',
    period: 'Période',
    monthNames: [
      'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
      'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
    ],
    summary: 'Synthèse',
    created: 'BTs créés',
    completed: 'BTs complétés',
    successRate: 'Taux de réussite',
    slaBreachRate: 'Taux de dépassement SLA',
    resolutionTime: 'Temps de résolution par type',
    completionOutcome: 'Issues de complétion par type',
    sla: 'Conformité SLA par type',
    taskType: 'Type',
    count: 'Nb',
    average: 'Moyenne',
    median: 'Médiane',
    positive: 'Positifs',
    negative: 'Négatifs',
    tracked: 'Suivis',
    breached: 'Dépassés',
    untyped: 'Sans type',
    noData: 'Aucune donnée',
    generated: 'Document généré le',
  },
  en: {
    title: 'Monthly report',
    period: 'Period',
    monthNames: [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December',
    ],
    summary: 'Summary',
    created: 'BTs created',
    completed: 'BTs completed',
    successRate: 'Success rate',
    slaBreachRate: 'SLA breach rate',
    resolutionTime: 'Resolution time by type',
    completionOutcome: 'Completion outcomes by type',
    sla: 'SLA compliance by type',
    taskType: 'Type',
    count: 'Count',
    average: 'Average',
    median: 'Median',
    positive: 'Positive',
    negative: 'Negative',
    tracked: 'Tracked',
    breached: 'Breached',
    untyped: 'Untyped',
    noData: 'No data',
    generated: 'Document generated on',
  },
};

function esc(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function fmtPct(rate: number | null): string {
  if (rate === null) return '—';
  return `${(rate * 100).toFixed(0)} %`;
}

function fmtHours(h: number): string {
  if (h < 1) return `${Math.round(h * 60)} min`;
  if (h < 24) return `${h.toFixed(1)} h`;
  return `${(h / 24).toFixed(1)} j`;
}

export function renderMonthlyReportPdfHtml(
  data: MonthlyReportData,
  locale: 'fr' | 'en' = 'fr',
): string {
  const t = STRINGS[locale];
  const monthName = t.monthNames[data.month - 1] ?? String(data.month);
  const totalCompletion = data.totals.completedPositive + data.totals.completedNegative;
  const successRate = totalCompletion > 0 ? data.totals.completedPositive / totalCompletion : null;
  const slaRate = data.totals.slaTracked > 0 ? data.totals.slaBreached / data.totals.slaTracked : null;

  const resolutionRows = data.resolutionTime.length
    ? data.resolutionTime
        .map(
          (r) => `<tr>
            <td>${esc(r.taskTypeName ?? t.untyped)}</td>
            <td>${esc(r.completedCount)}</td>
            <td>${esc(fmtHours(r.avgResolutionHours))}</td>
            <td>${esc(fmtHours(r.medianResolutionHours))}</td>
          </tr>`,
        )
        .join('')
    : `<tr><td colspan="4" class="muted">${esc(t.noData)}</td></tr>`;

  const outcomeRows = data.completionOutcome.length
    ? data.completionOutcome
        .map(
          (r) => `<tr>
            <td>${esc(r.taskTypeName ?? t.untyped)}</td>
            <td>${esc(r.positive)}</td>
            <td>${esc(r.negative)}</td>
            <td>${esc(fmtPct(r.successRate))}</td>
          </tr>`,
        )
        .join('')
    : `<tr><td colspan="4" class="muted">${esc(t.noData)}</td></tr>`;

  const slaRows = data.sla.length
    ? data.sla
        .map(
          (r) => `<tr>
            <td>${esc(r.taskTypeName ?? t.untyped)}</td>
            <td>${esc(r.tracked)}</td>
            <td>${esc(r.breached)}</td>
            <td>${esc(fmtPct(r.breachRate))}</td>
          </tr>`,
        )
        .join('')
    : `<tr><td colspan="4" class="muted">${esc(t.noData)}</td></tr>`;

  return `<!doctype html>
<html lang="${esc(locale)}">
<head>
<meta charset="utf-8" />
<title>${esc(t.title)} — ${esc(monthName)} ${esc(data.year)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", "Noto Sans", sans-serif; color: #1f2937; margin: 0; padding: 0; font-size: 10pt; line-height: 1.5; }
  header { border-bottom: 3px solid #2563eb; padding-bottom: 12px; margin-bottom: 20px; }
  h1 { font-size: 22pt; color: #111827; margin: 0 0 4px; }
  .period { color: #6b7280; font-size: 12pt; font-weight: 600; }
  h2 { color: #2563eb; font-size: 14pt; margin: 24px 0 10px; padding-bottom: 4px; border-bottom: 1px solid #e5e7eb; }
  .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin: 10px 0 16px; }
  .kpi { padding: 12px; background: #f9fafb; border-left: 4px solid #2563eb; border-radius: 4px; }
  .kpi .label { font-size: 9pt; color: #6b7280; text-transform: uppercase; letter-spacing: 0.04em; }
  .kpi .value { font-size: 18pt; font-weight: 700; color: #111827; margin-top: 2px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 8px; font-size: 10pt; }
  th { text-align: left; background: #f3f4f6; padding: 6px 8px; font-weight: 600; color: #374151; }
  td { padding: 6px 8px; border-top: 1px solid #e5e7eb; }
  .muted { color: #9ca3af; font-style: italic; text-align: center; }
  footer { margin-top: 32px; padding-top: 8px; border-top: 1px solid #e5e7eb; color: #9ca3af; font-size: 8pt; text-align: center; }
</style>
</head>
<body>
<header>
  <h1>${esc(t.title)}</h1>
  <div class="period">${esc(t.period)} : ${esc(monthName)} ${esc(data.year)}</div>
</header>

<h2>${esc(t.summary)}</h2>
<div class="kpi-grid">
  <div class="kpi"><div class="label">${esc(t.created)}</div><div class="value">${esc(data.totals.created)}</div></div>
  <div class="kpi"><div class="label">${esc(t.completed)}</div><div class="value">${esc(data.totals.completed)}</div></div>
  <div class="kpi"><div class="label">${esc(t.successRate)}</div><div class="value">${esc(fmtPct(successRate))}</div></div>
  <div class="kpi"><div class="label">${esc(t.slaBreachRate)}</div><div class="value">${esc(fmtPct(slaRate))}</div></div>
</div>

<h2>${esc(t.resolutionTime)}</h2>
<table>
  <thead><tr><th>${esc(t.taskType)}</th><th>${esc(t.count)}</th><th>${esc(t.average)}</th><th>${esc(t.median)}</th></tr></thead>
  <tbody>${resolutionRows}</tbody>
</table>

<h2>${esc(t.completionOutcome)}</h2>
<table>
  <thead><tr><th>${esc(t.taskType)}</th><th>${esc(t.positive)}</th><th>${esc(t.negative)}</th><th>${esc(t.successRate)}</th></tr></thead>
  <tbody>${outcomeRows}</tbody>
</table>

<h2>${esc(t.sla)}</h2>
<table>
  <thead><tr><th>${esc(t.taskType)}</th><th>${esc(t.tracked)}</th><th>${esc(t.breached)}</th><th>${esc(t.slaBreachRate)}</th></tr></thead>
  <tbody>${slaRows}</tbody>
</table>

<footer>${esc(t.generated)} ${esc(new Date().toISOString())}</footer>
</body>
</html>`;
}
