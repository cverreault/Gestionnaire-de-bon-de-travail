import api from './api';

/**
 * CSV import / export for clients and addresses (B7.11).
 *
 * ADMIN-only routes. The backend enforces the role — the frontend just
 * surfaces the actions in the tenant admin's UI. Templates and export
 * responses are streamed as `text/csv` with a `Content-Disposition:
 * attachment` header so the browser triggers a download natively when
 * we navigate the link (see `downloadCsv` helpers below).
 */

export interface CsvImportResult {
  imported: number;
  errors: Array<{ line: number; message: string }>;
}

/** Trigger a browser download from a Blob (works for CSV strings too). */
function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** GET a CSV endpoint and stream the response to a file download. */
async function fetchAndDownloadCsv(path: string, filename: string) {
  const { data } = await api.get(path, { responseType: 'blob' });
  // Force the MIME type on the downloaded file so the OS opens it in the
  // right app (Excel, Numbers, LibreOffice). The backend sends
  // `text/csv; charset=utf-8` and the BOM is inside the blob body, so
  // Excel picks up UTF-8 without an "import wizard" prompt.
  const typed = new Blob([data as Blob], { type: 'text/csv;charset=utf-8' });
  downloadBlob(typed, filename);
}

// ─── Templates ──────────────────────────────────────────────────────

export function downloadClientTemplate(): Promise<void> {
  return fetchAndDownloadCsv('/clients/csv/template', 'clients-modele.csv');
}

export function downloadAddressTemplate(): Promise<void> {
  return fetchAndDownloadCsv(
    '/clients/csv/addresses/template',
    'adresses-modele.csv',
  );
}

// ─── Exports ────────────────────────────────────────────────────────

export function exportClientsCsv(): Promise<void> {
  return fetchAndDownloadCsv('/clients/csv/export', 'clients.csv');
}

export function exportAddressesCsv(): Promise<void> {
  return fetchAndDownloadCsv('/clients/csv/addresses/export', 'adresses.csv');
}

// ─── Imports ────────────────────────────────────────────────────────

async function importCsv(path: string, file: File): Promise<CsvImportResult> {
  const form = new FormData();
  form.append('file', file);
  const { data } = await api.post(path, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return (data.data ?? data) as CsvImportResult;
}

export function importClientsCsv(file: File): Promise<CsvImportResult> {
  return importCsv('/clients/csv/import', file);
}

export function importAddressesCsv(file: File): Promise<CsvImportResult> {
  return importCsv('/clients/csv/addresses/import', file);
}
