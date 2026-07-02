/**
 * Minimal RFC 4180-ish CSV utilities (B7.11).
 *
 * Enough for the client / address import & export flows :
 *   - Comma-separated values
 *   - Double quotes for fields containing commas / quotes / newlines
 *   - Escaped quote = doubled ("" inside quoted field)
 *   - CR / LF line endings (either)
 *
 * Kept dependency-free on purpose — installing `csv-parse` or `papaparse`
 * for four endpoints doubles our bundle size for no meaningful gain.
 */

/** Parse a CSV text into a 2D array of strings. Empty cells → ''. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  const n = text.length;

  while (i < n) {
    const c = text[i];

    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }

    if (c === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (c === ',') {
      row.push(field);
      field = '';
      i++;
      continue;
    }
    if (c === '\r') {
      // Swallow the \r; the \n (if any) handles the line break.
      i++;
      if (text[i] === '\n') i++;
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
      continue;
    }
    if (c === '\n') {
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
      i++;
      continue;
    }
    field += c;
    i++;
  }

  // Trailing field / row.
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  // Drop a fully-empty last row (common when file ends with a newline).
  if (rows.length > 0 && rows[rows.length - 1].every((c) => c === '')) {
    rows.pop();
  }
  return rows;
}

/** Serialise 2D data to CSV text. Quotes any cell containing , " or newline. */
export function stringifyCsv(rows: (string | number | null | undefined)[][]): string {
  return rows
    .map((r) => r.map(quoteCell).join(','))
    .join('\r\n');
}

function quoteCell(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * Map header row + data rows into `Record<header, cell>` objects.
 * Extra columns beyond the last header are dropped. Missing columns are
 * left as ''.
 */
export function csvToObjects<T extends string>(
  csv: string,
  requiredHeaders: readonly T[],
): { rows: Record<T, string>[]; missingHeaders: T[] } {
  const grid = parseCsv(csv);
  if (grid.length === 0) return { rows: [], missingHeaders: [...requiredHeaders] };

  const headers = grid[0].map((h) => h.trim());
  const missingHeaders = requiredHeaders.filter((h) => !headers.includes(h));
  const headerIndex: Record<string, number> = {};
  headers.forEach((h, idx) => {
    headerIndex[h] = idx;
  });

  const rows: Record<T, string>[] = [];
  for (let r = 1; r < grid.length; r++) {
    const row = grid[r];
    if (row.every((c) => c === '')) continue; // skip blank lines
    const obj = {} as Record<T, string>;
    for (const h of requiredHeaders) {
      const idx = headerIndex[h];
      obj[h] = idx !== undefined ? (row[idx] ?? '').trim() : '';
    }
    rows.push(obj);
  }
  return { rows, missingHeaders };
}
