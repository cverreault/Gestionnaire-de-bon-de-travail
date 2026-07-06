import { useTranslation } from 'react-i18next';
import { useMyStock } from '../hooks/useParts';
import { partName } from '../services/parts.service';
import { theme, cardStyles } from '../theme';

/** B24 — technician view of their truck stock (read-only). */
export default function MyStockPage() {
  const { t, i18n } = useTranslation('inventory');
  const locale = i18n.language ?? 'fr';
  const stock = useMyStock();

  return (
    <div style={{ padding: '1rem', paddingBottom: '5rem', maxWidth: 720, margin: '0 auto' }}>
      <h1 style={{ fontSize: theme.font.sizeXl, color: theme.colors.text, margin: '0 0 1rem' }}>
        📦 {t('myStock.title')}
      </h1>

      {(stock.data ?? []).length === 0 ? (
        <div style={{ ...cardStyles.card, padding: '1.5rem', textAlign: 'center' }}>
          <p style={{ margin: 0, color: theme.colors.textMuted, fontSize: theme.font.sizeSm }}>
            {t('myStock.empty')}
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {(stock.data ?? []).map((row) => (
            <div
              key={row.id}
              style={{
                ...cardStyles.card,
                padding: '0.75rem 1rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
              }}
            >
              <span style={{ fontFamily: 'monospace', fontSize: theme.font.sizeXs, color: theme.colors.textMuted }}>
                {row.part.sku}
              </span>
              <span style={{ flex: 1, fontSize: theme.font.sizeSm, color: theme.colors.text }}>
                {partName(row.part, locale)}
              </span>
              <strong style={{ fontSize: theme.font.sizeMd, color: theme.colors.primary, whiteSpace: 'nowrap' }}>
                {row.quantity} {row.part.unit}
              </strong>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
