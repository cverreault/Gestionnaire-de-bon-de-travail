import { useTranslation } from 'react-i18next';
import { TemplateFieldType } from '../types';
import type { AddressTypeConfigField } from '../types';
import { theme, formStyles } from '../theme';

interface Props {
  fields: AddressTypeConfigField[];
  values: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
}

/**
 * Lightweight renderer for AddressTypeConfig.fields. Stores values under
 * `ClientAddress.typeData` keyed by fieldId. Handles the common subset of
 * TemplateFieldType — for advanced types (GPS, MULTISELECT, RADIO, etc.)
 * we fall back to a plain text input. The full renderer in
 * TemplateFormRenderer expects a sections+fields tree so we keep this minimal.
 */
export default function AddressTypeCustomFields({ fields, values, onChange }: Props) {
  const { t } = useTranslation('addresses');
  function setField(id: string, value: unknown) {
    onChange({ ...values, [id]: value });
  }

  if (!fields || fields.length === 0) return null;

  return (
    <div style={{
      marginTop: '0.5rem',
      padding: '0.75rem',
      background: theme.colors.surface,
      border: theme.borders.default,
      borderRadius: theme.radius.md,
    }}>
      <p style={{ margin: '0 0 0.5rem', fontSize: theme.font.sizeXs, fontWeight: theme.font.weightSemibold, color: theme.colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        {t('fields.customFieldsTitle')}
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.5rem' }}>
        {fields.map((f) => (
          <div key={f.id}>
            <label style={{ ...formStyles.label }}>
              {f.label}
              {f.required && <span style={{ color: theme.colors.danger, marginLeft: '0.2rem' }}>*</span>}
            </label>
            <FieldInput field={f} value={values[f.id]} onChange={(v) => setField(f.id, v)} />
          </div>
        ))}
      </div>
    </div>
  );
}

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: AddressTypeConfigField;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const inputStyle = { ...formStyles.input, boxSizing: 'border-box' as const };

  switch (field.fieldType) {
    case TemplateFieldType.TEXTAREA:
      return (
        <textarea
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value)}
          rows={2}
          style={{ ...formStyles.textarea, boxSizing: 'border-box' }}
        />
      );
    case TemplateFieldType.NUMBER:
    case TemplateFieldType.FLOAT:
      return (
        <input
          type="number" step="any"
          value={value === null || value === undefined ? '' : String(value)}
          onChange={(e) => onChange(e.target.value === '' ? null : parseFloat(e.target.value))}
          style={inputStyle}
        />
      );
    case TemplateFieldType.INTEGER:
      return (
        <input
          type="number" step="1"
          value={value === null || value === undefined ? '' : String(value)}
          onChange={(e) => onChange(e.target.value === '' ? null : parseInt(e.target.value, 10))}
          style={inputStyle}
        />
      );
    case TemplateFieldType.CHECKBOX:
      return (
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(e) => onChange(e.target.checked)}
        />
      );
    case TemplateFieldType.DATE:
      return (
        <input
          type="date"
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value || null)}
          style={inputStyle}
        />
      );
    case TemplateFieldType.SELECT:
      return (
        <select
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value || null)}
          style={{ ...formStyles.select, boxSizing: 'border-box' }}
        >
          <option value="">— Choisir —</option>
          {(field.options ?? []).map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      );
    case TemplateFieldType.EMAIL:
      return (
        <input type="email" value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value)} style={inputStyle} />
      );
    case TemplateFieldType.URL:
      return (
        <input type="url" value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value)} style={inputStyle} />
      );
    case TemplateFieldType.PHONE:
    case TemplateFieldType.PHONE_NA:
      return (
        <input type="tel" value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value)} style={inputStyle} />
      );
    case TemplateFieldType.TEXT:
    default:
      return (
        <input type="text" value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value)} style={inputStyle} />
      );
  }
}
