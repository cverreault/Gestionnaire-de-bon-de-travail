import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Role } from '../types';
import { useAuthStore } from '../context/auth.store';
import { theme, cardStyles, buttonStyles } from '../theme';
import { toast } from '../context/toast.store';
import type { CsvImportResult } from '../services/clients-csv.service';

/**
 * Reusable CSV import/export panel (B7.11).
 *
 * Injects three buttons + an inline error report :
 *   - 📥 Télécharger le modèle
 *   - ⬇️ Exporter en CSV
 *   - ⬆️ Importer un CSV (opens a file picker, then reports imported count
 *     and per-line errors returned by the backend)
 *
 * ADMIN-only. Hidden for other roles so nothing shows up when it doesn't
 * make sense. Backend enforces the guard regardless.
 */
export interface CsvImportExportPanelProps {
  title: string;
  helpText: string;
  onDownloadTemplate: () => Promise<void>;
  onExport: () => Promise<void>;
  onImport: (file: File) => Promise<CsvImportResult>;
  /** Cache-invalidation query keys after a successful import. */
  invalidateKeys?: unknown[][];
}

export default function CsvImportExportPanel({
  title,
  helpText,
  onDownloadTemplate,
  onExport,
  onImport,
  invalidateKeys,
}: CsvImportExportPanelProps) {
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [result, setResult] = useState<CsvImportResult | null>(null);
  const { t } = useTranslation('csv');

  const importMut = useMutation({
    mutationFn: (file: File) => onImport(file),
    onSuccess: (r) => {
      setResult(r);
      if (r.imported > 0) {
        toast.success(t('toasts.imported', { count: r.imported }));
        for (const key of invalidateKeys ?? []) {
          qc.invalidateQueries({ queryKey: key });
        }
      } else if (r.errors.length > 0) {
        toast.error(t('toasts.errorCount', { count: r.errors.length }));
      }
    },
    onError: (err) => {
      const msg =
        (err as { response?: { data?: { message?: string | string[] } } })
          ?.response?.data?.message ?? t('toasts.importFailed');
      toast.error(Array.isArray(msg) ? msg.join(', ') : msg);
      setResult(null);
    },
  });

  const templateMut = useMutation({
    mutationFn: onDownloadTemplate,
    onError: () => toast.error(t('toasts.templateFailed')),
  });
  const exportMut = useMutation({
    mutationFn: onExport,
    onError: () => toast.error(t('toasts.exportFailed')),
  });

  if (user?.role !== Role.ADMIN) return null;

  const busy = importMut.isPending || exportMut.isPending || templateMut.isPending;

  return (
    <section
      style={{
        ...cardStyles.card,
        padding: 16,
        marginBottom: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <div>
        <h3 style={{ margin: 0, fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span>📁</span>
          <span>{title}</span>
        </h3>
        <p style={{ margin: '4px 0 0', fontSize: 12, color: theme.colors.textMuted, lineHeight: 1.5 }}>
          {helpText}
        </p>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button
          onClick={() => templateMut.mutate()}
          disabled={busy}
          style={{ ...buttonStyles.secondary, opacity: busy ? 0.5 : 1 }}
          title={t('buttons.templateTooltip')}
        >
          📥 {templateMut.isPending ? t('buttons.templateBusy') : t('buttons.template')}
        </button>
        <button
          onClick={() => exportMut.mutate()}
          disabled={busy}
          style={{ ...buttonStyles.secondary, opacity: busy ? 0.5 : 1 }}
          title={t('buttons.exportTooltip')}
        >
          ⬇️ {exportMut.isPending ? t('buttons.exportBusy') : t('buttons.export')}
        </button>
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={busy}
          style={{ ...buttonStyles.primary, opacity: busy ? 0.5 : 1 }}
          title={t('buttons.importTooltip')}
        >
          ⬆️ {importMut.isPending ? t('buttons.importBusy') : t('buttons.import')}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = ''; // allow re-selecting the same file
            if (f) {
              setResult(null);
              importMut.mutate(f);
            }
          }}
        />
      </div>

      {result && result.imported > 0 && result.errors.length === 0 && (
        <div
          style={{
            padding: '8px 12px',
            borderRadius: 6,
            background: theme.colors.successLight,
            color: theme.colors.success,
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          {t('resultSuccess', { count: result.imported })}
        </div>
      )}

      {result && result.errors.length > 0 && (
        <div
          style={{
            padding: '10px 12px',
            borderRadius: 6,
            background: theme.colors.dangerLight,
            border: `1px solid ${theme.colors.danger}`,
            color: theme.colors.danger,
            fontSize: 12,
          }}
        >
          <strong>{t('resultAborted', { count: result.errors.length })}</strong>
          <ul style={{ margin: '6px 0 0', paddingLeft: 18, maxHeight: 200, overflowY: 'auto' }}>
            {result.errors.slice(0, 100).map((e, i) => (
              <li key={i}>
                {t('resultLine', { line: e.line, message: e.message })}
              </li>
            ))}
            {result.errors.length > 100 && (
              <li style={{ fontStyle: 'italic' }}>
                {t('resultMore', { count: result.errors.length - 100 })}
              </li>
            )}
          </ul>
          <div style={{ fontSize: 11, marginTop: 6, opacity: 0.85 }}>
            {t('resultFix')}
          </div>
        </div>
      )}
    </section>
  );
}
