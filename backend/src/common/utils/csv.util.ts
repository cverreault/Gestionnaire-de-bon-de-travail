/**
 * Minimal CSV serializer — no external dependency.
 *
 * Standard RFC 4180 escape rules:
 *  - fields containing comma, quote, CR or LF are wrapped in double quotes
 *  - embedded double quotes are doubled
 *  - all other fields rendered as-is
 *
 * Returns the file with a BOM so Excel (Windows locales) opens UTF-8 correctly.
 */

const NEEDS_QUOTING = /[",\r\n;]/;
const UTF8_BOM = '﻿';

function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = value instanceof Date ? value.toISOString() : String(value);
  if (!NEEDS_QUOTING.test(s)) return s;
  return `"${s.replace(/"/g, '""')}"`;
}

export function toCsv<T extends Record<string, unknown>>(
  rows: T[],
  columns: { header: string; pick: (row: T) => unknown }[],
): string {
  const headerLine = columns.map((c) => escapeCell(c.header)).join(',');
  const dataLines = rows.map((row) =>
    columns.map((c) => escapeCell(c.pick(row))).join(','),
  );
  return UTF8_BOM + [headerLine, ...dataLines].join('\r\n') + '\r\n';
}
