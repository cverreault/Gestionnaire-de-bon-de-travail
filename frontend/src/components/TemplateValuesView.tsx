import type { ReactNode } from 'react';
import { TemplateFieldType } from '../types';
import type { TemplateField, WorkOrderTemplate } from '../types';
import { theme } from '../theme';

interface Props {
  template: WorkOrderTemplate;
  values: Record<string, unknown>;
}

const EMPTY = '—';

function formatValue(field: TemplateField, value: unknown): ReactNode {
  if (value === null || value === undefined || value === '') return EMPTY;

  switch (field.fieldType) {
    case TemplateFieldType.CHECKBOX:
      return value ? '✓ Oui' : '✗ Non';

    case TemplateFieldType.MULTISELECT:
      if (!Array.isArray(value) || value.length === 0) return EMPTY;
      return (value as unknown[]).map(String).join(', ');

    case TemplateFieldType.EMAIL: {
      const email = String(value);
      return (
        <a href={`mailto:${email}`} style={{ color: theme.colors.primary, textDecoration: 'none' }}>
          {email}
        </a>
      );
    }

    case TemplateFieldType.URL: {
      const url = String(value);
      return (
        <a href={url} target="_blank" rel="noopener noreferrer" style={{ color: theme.colors.primary, textDecoration: 'none' }}>
          {url}
        </a>
      );
    }

    case TemplateFieldType.CURRENCY: {
      const n = typeof value === 'number' ? value : Number(value);
      if (Number.isNaN(n)) return String(value);
      return new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'CAD' }).format(n);
    }

    case TemplateFieldType.PERCENTAGE: {
      const n = typeof value === 'number' ? value : Number(value);
      if (Number.isNaN(n)) return String(value);
      return `${n} %`;
    }

    case TemplateFieldType.INTEGER:
    case TemplateFieldType.FLOAT:
    case TemplateFieldType.NUMBER:
      return String(value);

    case TemplateFieldType.DATETIME: {
      const d = new Date(String(value));
      if (Number.isNaN(d.getTime())) return String(value);
      return d.toLocaleString('fr-CA');
    }

    case TemplateFieldType.DATE: {
      const d = new Date(String(value));
      if (Number.isNaN(d.getTime())) return String(value);
      return d.toLocaleDateString('fr-CA');
    }

    case TemplateFieldType.TIME:
      return String(value);

    case TemplateFieldType.GPS: {
      if (typeof value !== 'object' || value === null) return EMPTY;
      const g = value as { lat?: unknown; lng?: unknown };
      const lat = typeof g.lat === 'number' ? g.lat : Number(g.lat);
      const lng = typeof g.lng === 'number' ? g.lng : Number(g.lng);
      if (Number.isNaN(lat) || Number.isNaN(lng)) return EMPTY;
      const text = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
      const mapsUrl = `https://www.google.com/maps?q=${lat},${lng}`;
      return (
        <a href={mapsUrl} target="_blank" rel="noopener noreferrer" style={{ color: theme.colors.primary, textDecoration: 'none' }}>
          📍 {text}
        </a>
      );
    }

    default:
      return String(value);
  }
}

export default function TemplateValuesView({ template, values }: Props) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {template.sections.map((sec) => (
        <div key={sec.id}>
          <p
            style={{
              margin: '0 0 0.5rem',
              fontSize: theme.font.sizeSm,
              fontWeight: theme.font.weightSemibold,
              color: theme.colors.textSecondary,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
            }}
          >
            {sec.name}
          </p>
          {sec.fields.length === 0 ? (
            <p style={{ margin: 0, color: theme.colors.textMuted, fontSize: theme.font.sizeXs, fontStyle: 'italic' }}>
              Aucun champ.
            </p>
          ) : (
            <dl style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.5rem 1rem', margin: 0 }}>
              {sec.fields.map((f) => (
                <div key={f.id}>
                  <dt style={{ fontSize: theme.font.sizeXs, color: theme.colors.textMuted, marginBottom: '0.1rem' }}>{f.label}</dt>
                  <dd style={{ margin: 0, fontSize: theme.font.sizeSm, color: theme.colors.text, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                    {formatValue(f, values[f.id])}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      ))}
    </div>
  );
}
