import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  useAddWorkOrderPart,
  usePartsCatalog,
  useRemoveWorkOrderPart,
  useWorkOrderParts,
} from '../hooks/useParts';
import { partName } from '../services/parts.service';
import { theme, buttonStyles, formStyles } from '../theme';
import { toast } from '../context/toast.store';

/**
 * B24 — "Parts used" card shared by the staff and technician WO detail
 * pages. Adding consumes stock (technician truck by default for techs,
 * warehouse for staff — the backend resolves it); removing credits it
 * back. Locked once the WO is terminal.
 */
export default function WorkOrderPartsSection({
  workOrderId,
  readOnly = false,
  cardStyle,
  titleStyle,
}: {
  workOrderId: string;
  readOnly?: boolean;
  cardStyle?: React.CSSProperties;
  titleStyle?: React.CSSProperties;
}) {
  const { t, i18n } = useTranslation('inventory');
  const locale = i18n.language ?? 'fr';
  const [partId, setPartId] = useState('');
  const [quantity, setQuantity] = useState('1');

  const parts = useWorkOrderParts(workOrderId);
  const catalog = usePartsCatalog(!readOnly);
  const addPart = useAddWorkOrderPart(workOrderId);
  const removePart = useRemoveWorkOrderPart(workOrderId);

  const showError = (err: unknown) => {
    const msg =
      (err as { response?: { data?: { message?: string | string[] } } })?.response?.data
        ?.message ?? String(err);
    toast.error(Array.isArray(msg) ? msg.join(', ') : String(msg));
  };

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const qty = parseInt(quantity, 10);
    if (!partId || !Number.isFinite(qty) || qty <= 0 || addPart.isPending) return;
    try {
      await addPart.mutateAsync({ partId, quantity: qty });
      toast.success(t('woSection.added'));
      setPartId('');
      setQuantity('1');
    } catch (err) {
      showError(err);
    }
  }

  async function handleRemove(rowId: string) {
    try {
      await removePart.mutateAsync(rowId);
      toast.success(t('woSection.removed'));
    } catch (err) {
      showError(err);
    }
  }

  return (
    <div style={cardStyle}>
      <h2 style={titleStyle}>🔩 {t('woSection.title')}</h2>

      {(parts.data ?? []).length === 0 ? (
        <p style={{ fontSize: theme.font.sizeSm, color: theme.colors.textMuted, margin: '0 0 0.75rem' }}>
          {t('woSection.empty')}
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginBottom: '0.75rem' }}>
          {(parts.data ?? []).map((row) => (
            <div
              key={row.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.5rem 0.75rem',
                background: theme.colors.surfaceAlt,
                border: theme.borders.light,
                borderRadius: theme.radius.md,
                flexWrap: 'wrap',
              }}
            >
              <span style={{ fontFamily: 'monospace', fontSize: theme.font.sizeXs, color: theme.colors.textMuted }}>
                {row.part.sku}
              </span>
              <span style={{ fontSize: theme.font.sizeSm, color: theme.colors.text, flex: 1, minWidth: 120 }}>
                {partName(row.part, locale)}
              </span>
              <span style={{ fontSize: theme.font.sizeSm, color: theme.colors.textSecondary, whiteSpace: 'nowrap' }}>
                {t('woSection.quantity')} {row.quantity} {row.part.unit}
              </span>
              <span style={{ fontSize: theme.font.sizeXs, color: theme.colors.textMuted, whiteSpace: 'nowrap' }}>
                {row.source === 'WAREHOUSE' ? `🏭 ${t('woSection.warehouse')}` : `🚚 ${t('woSection.truck')}`}
              </span>
              {!readOnly && (
                <button
                  onClick={() => handleRemove(row.id)}
                  disabled={removePart.isPending}
                  title={t('woSection.remove')}
                  style={{ ...buttonStyles.ghost, padding: '0.15rem 0.4rem', color: theme.colors.danger }}
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {!readOnly && (
        <form onSubmit={handleAdd} style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <select
            value={partId}
            onChange={(e) => setPartId(e.target.value)}
            style={{ ...formStyles.select, flex: 1, minWidth: 180 }}
          >
            <option value="">{t('woSection.selectPart')}</option>
            {(catalog.data ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.sku} — {partName(p, locale)}
              </option>
            ))}
          </select>
          <input
            type="number"
            min={1}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            style={{ ...formStyles.input, width: 90 }}
            aria-label={t('woSection.quantity')}
          />
          <button
            type="submit"
            disabled={!partId || addPart.isPending}
            style={{ ...buttonStyles.primary, ...buttonStyles.sm, opacity: !partId || addPart.isPending ? 0.6 : 1 }}
          >
            ➕ {t('woSection.add')}
          </button>
        </form>
      )}
    </div>
  );
}
