import api from './api';

export interface DateRangePayload {
  from: string;
  to: string;
}

export interface ResolutionTimeRow {
  taskTypeId: string | null;
  taskTypeName: string | null;
  completedCount: number;
  avgResolutionHours: number;
  medianResolutionHours: number;
}

export interface CompletionOutcomeRow {
  taskTypeId: string | null;
  taskTypeName: string | null;
  positive: number;
  negative: number;
  successRate: number | null;
}

export interface SlaSummaryRow {
  taskTypeId: string | null;
  taskTypeName: string | null;
  tracked: number;
  breached: number;
  breachRate: number | null;
}

export interface ThroughputBucket {
  date: string;
  created: number;
  completed: number;
}

interface KpiQuery {
  from?: string;
  to?: string;
}

function toParams(q: KpiQuery): Record<string, string> {
  const out: Record<string, string> = {};
  if (q.from) out.from = q.from;
  if (q.to) out.to = q.to;
  return out;
}

export interface ReportsCapabilities {
  pdfAvailable: boolean;
}

export async function getCapabilities(): Promise<ReportsCapabilities> {
  const { data } = await api.get<ReportsCapabilities>('/reports/capabilities');
  return data;
}

export async function getResolutionTime(q: KpiQuery): Promise<{
  range: DateRangePayload;
  rows: ResolutionTimeRow[];
}> {
  const { data } = await api.get('/reports/kpis/resolution-time', {
    params: toParams(q),
  });
  return data;
}

export async function getCompletionOutcome(q: KpiQuery): Promise<{
  range: DateRangePayload;
  rows: CompletionOutcomeRow[];
}> {
  const { data } = await api.get('/reports/kpis/completion-outcome', {
    params: toParams(q),
  });
  return data;
}

export async function getSlaSummary(q: KpiQuery): Promise<{
  range: DateRangePayload;
  rows: SlaSummaryRow[];
}> {
  const { data } = await api.get('/reports/kpis/sla', {
    params: toParams(q),
  });
  return data;
}

export async function getThroughput(q: KpiQuery): Promise<{
  range: DateRangePayload;
  buckets: ThroughputBucket[];
}> {
  const { data } = await api.get('/reports/kpis/throughput', {
    params: toParams(q),
  });
  return data;
}

/**
 * Trigger a browser download for the work-order PDF. Uses fetch with
 * blob() instead of <a download> because the JWT lives in axios'
 * default headers, not in cookies — a naked anchor wouldn't send it.
 */
export async function downloadWorkOrderPdf(id: string, locale: 'fr' | 'en' = 'fr'): Promise<void> {
  const response = await api.get(`/reports/work-orders/${id}/pdf`, {
    params: { locale },
    responseType: 'blob',
  });
  const blob = response.data as Blob;
  const filename = extractFilename(response.headers['content-disposition'] as string | undefined)
    ?? `BT-${id}.pdf`;
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function extractFilename(disposition: string | undefined): string | null {
  if (!disposition) return null;
  const match = disposition.match(/filename="?([^"]+)"?/);
  return match ? match[1] : null;
}
