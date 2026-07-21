import { useTranslation } from 'react-i18next';
import { TemplateFieldType, Role } from '../types';
import type { TemplateField, WorkOrderTemplate } from '../types';
import { theme, formStyles } from '../theme';
import { formatPhoneNA, formatPostalCodeCA } from './template-field-formatters';

type GpsValue = { lat: number | null; lng: number | null };

function asGps(v: unknown): GpsValue {
  if (v && typeof v === 'object' && 'lat' in v && 'lng' in v) {
    const g = v as { lat: unknown; lng: unknown };
    const num = (x: unknown): number | null => (typeof x === 'number' ? x : x === '' || x === null || x === undefined ? null : Number(x));
    return { lat: num(g.lat), lng: num(g.lng) };
  }
  return { lat: null, lng: null };
}

interface Props {
  template: WorkOrderTemplate;
  values: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
  /** Globally disable the form (read-only mode regardless of RBAC). */
  disabled?: boolean;
  /** The role of the current user. Used to apply per-field edit/required rules. */
  userRole?: Role;
}

export default function TemplateFormRenderer({ template, values, onChange, disabled, userRole }: Props) {
  const { t } = useTranslation('settings');
  function setField(fieldId: string, value: unknown) {
    onChange({ ...values, [fieldId]: value });
  }

  // Backend already filtered viewRoles before sending. We still re-check
  // defensively in case the renderer is fed an unfiltered template.
  const visibleSections = template.sections.filter(
    (s) => !userRole || userRole === Role.ADMIN || s.viewRoles.includes(userRole),
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {visibleSections.length === 0 ? (
        <p style={{ color: theme.colors.textMuted, fontSize: theme.font.sizeSm, fontStyle: 'italic', margin: 0 }}>
          {t('settings:formRenderer.noVisibleSections', { defaultValue: 'Aucune section visible pour votre rôle.' })}
        </p>
      ) : (
        visibleSections.map((sec) => {
          const visibleFields = sec.fields.filter(
            (f) => !userRole || userRole === Role.ADMIN || f.viewRoles.includes(userRole),
          );
          return (
            <fieldset
              key={sec.id}
              style={{
                border: theme.borders.default,
                borderRadius: theme.radius.md,
                padding: '0.75rem 1rem 1rem',
                margin: 0,
                background: theme.colors.surface,
              }}
            >
              <legend
                style={{
                  padding: '0 0.5rem',
                  fontSize: theme.font.sizeSm,
                  fontWeight: theme.font.weightSemibold,
                  color: theme.colors.text,
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                }}
              >
                {sec.name}
              </legend>
              {visibleFields.length === 0 ? (
                <p style={{ margin: 0, fontSize: theme.font.sizeXs, color: theme.colors.textMuted, fontStyle: 'italic' }}>
                  {t('settings:formRenderer.noVisibleFields', { defaultValue: 'Aucun champ visible dans cette section.' })}
                </p>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem' }}>
                  {visibleFields.map((field) => {
                    const canEdit = !userRole
                      || userRole === Role.ADMIN
                      || field.editRoles.includes(userRole);
                    const isRequiredForRole = !!userRole && field.requiredRoles.includes(userRole);
                    return (
                      <FieldInput
                        key={field.id}
                        field={field}
                        value={values[field.id]}
                        onChange={(v) => setField(field.id, v)}
                        disabled={disabled || !canEdit}
                        required={isRequiredForRole}
                      />
                    );
                  })}
                </div>
              )}
            </fieldset>
          );
        })
      )}
    </div>
  );
}

function FieldInput({
  field,
  value,
  onChange,
  disabled,
  required,
}: {
  field: TemplateField;
  value: unknown;
  onChange: (v: unknown) => void;
  disabled?: boolean;
  required?: boolean;
}) {
  const { t } = useTranslation('settings');
  const v = value as string | number | boolean | undefined;
  const labelEl = (
    <label style={{ ...formStyles.label }}>
      {field.label}
      {required && <span style={{ color: theme.colors.danger, marginLeft: '0.2rem' }}>*</span>}
    </label>
  );
  const helpEl = field.helpText ? (
    <p style={{ ...formStyles.fieldHint }}>{field.helpText}</p>
  ) : null;

  const inputStyle = { ...formStyles.input, boxSizing: 'border-box' as const };
  const handleNumber = (e: React.ChangeEvent<HTMLInputElement>, parser: (s: string) => number) => {
    const raw = e.target.value;
    onChange(raw === '' ? null : parser(raw));
  };

  switch (field.fieldType) {
    case TemplateFieldType.TEXTAREA:
      return (
        <div>
          {labelEl}
          <textarea
            value={(v as string) ?? ''}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder ?? ''}
            disabled={disabled}
            rows={3}
            style={{ ...formStyles.textarea, boxSizing: 'border-box' }}
          />
          {helpEl}
        </div>
      );

    case TemplateFieldType.NUMBER:
    case TemplateFieldType.FLOAT:
      return (
        <div>
          {labelEl}
          <input type="number" step="any"
            value={v === undefined || v === null ? '' : String(v)}
            onChange={(e) => handleNumber(e, parseFloat)}
            placeholder={field.placeholder ?? ''} disabled={disabled} style={inputStyle}
          />
          {helpEl}
        </div>
      );

    case TemplateFieldType.INTEGER:
      return (
        <div>
          {labelEl}
          <input type="number" step="1"
            value={v === undefined || v === null ? '' : String(v)}
            onChange={(e) => handleNumber(e, (s) => parseInt(s, 10))}
            placeholder={field.placeholder ?? ''} disabled={disabled} style={inputStyle}
          />
          {helpEl}
        </div>
      );

    case TemplateFieldType.CURRENCY:
      return (
        <div>
          {labelEl}
          <div style={{ display: 'flex', alignItems: 'stretch' }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', padding: '0 0.625rem',
              background: theme.colors.surfaceAlt, border: theme.borders.default, borderRight: 'none',
              borderRadius: `${theme.radius.md} 0 0 ${theme.radius.md}`, color: theme.colors.textMuted, fontSize: theme.font.sizeSm,
            }}>$</span>
            <input type="number" step="0.01"
              value={v === undefined || v === null ? '' : String(v)}
              onChange={(e) => handleNumber(e, parseFloat)}
              placeholder={field.placeholder ?? '0.00'} disabled={disabled}
              style={{ ...inputStyle, borderRadius: `0 ${theme.radius.md} ${theme.radius.md} 0`, flex: 1, minWidth: 0 }}
            />
          </div>
          {helpEl}
        </div>
      );

    case TemplateFieldType.PERCENTAGE:
      return (
        <div>
          {labelEl}
          <div style={{ display: 'flex', alignItems: 'stretch' }}>
            <input type="number" step="0.01" min={0} max={100}
              value={v === undefined || v === null ? '' : String(v)}
              onChange={(e) => handleNumber(e, parseFloat)}
              placeholder={field.placeholder ?? '0'} disabled={disabled}
              style={{ ...inputStyle, borderRadius: `${theme.radius.md} 0 0 ${theme.radius.md}`, flex: 1, minWidth: 0 }}
            />
            <span style={{
              display: 'inline-flex', alignItems: 'center', padding: '0 0.625rem',
              background: theme.colors.surfaceAlt, border: theme.borders.default, borderLeft: 'none',
              borderRadius: `0 ${theme.radius.md} ${theme.radius.md} 0`, color: theme.colors.textMuted, fontSize: theme.font.sizeSm,
            }}>%</span>
          </div>
          {helpEl}
        </div>
      );

    case TemplateFieldType.EMAIL:
      return (
        <div>
          {labelEl}
          <input type="email"
            value={(v as string) ?? ''}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder ?? t('settings:formRenderer.emailPlaceholder', { defaultValue: 'nom@exemple.com' })} disabled={disabled} style={inputStyle}
          />
          {helpEl}
        </div>
      );

    case TemplateFieldType.URL:
      return (
        <div>
          {labelEl}
          <input type="url"
            value={(v as string) ?? ''}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder ?? t('settings:formRenderer.urlPlaceholder', { defaultValue: 'https://exemple.com' })} disabled={disabled} style={inputStyle}
          />
          {helpEl}
        </div>
      );

    case TemplateFieldType.PHONE:
      return (
        <div>
          {labelEl}
          <input type="tel"
            value={(v as string) ?? ''}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder ?? ''} disabled={disabled} style={inputStyle}
          />
          {helpEl}
        </div>
      );

    case TemplateFieldType.PHONE_NA:
      return (
        <div>
          {labelEl}
          <input type="tel" maxLength={12}
            value={(v as string) ?? ''}
            onChange={(e) => onChange(formatPhoneNA(e.target.value))}
            placeholder={field.placeholder ?? '514-555-1234'} disabled={disabled} style={inputStyle}
          />
          {helpEl}
        </div>
      );

    case TemplateFieldType.POSTAL_CODE_CA:
      return (
        <div>
          {labelEl}
          <input type="text" maxLength={7}
            value={(v as string) ?? ''}
            onChange={(e) => onChange(formatPostalCodeCA(e.target.value))}
            placeholder={field.placeholder ?? 'H1A 2B3'} disabled={disabled}
            style={{ ...inputStyle, textTransform: 'uppercase' }}
          />
          {helpEl}
        </div>
      );

    case TemplateFieldType.CHECKBOX:
      return (
        <div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: theme.font.sizeSm, color: theme.colors.text }}>
            <input type="checkbox" checked={Boolean(v)} onChange={(e) => onChange(e.target.checked)} disabled={disabled} />
            {field.label}
            {required && <span style={{ color: theme.colors.danger }}>*</span>}
          </label>
          {helpEl}
        </div>
      );

    case TemplateFieldType.SELECT:
      return (
        <div>
          {labelEl}
          <select
            value={(v as string) ?? ''}
            onChange={(e) => onChange(e.target.value || null)}
            disabled={disabled}
            style={{ ...formStyles.select, boxSizing: 'border-box' }}
          >
            <option value="">{t('settings:formRenderer.chooseOption', { defaultValue: '— Choisir —' })}</option>
            {(field.options ?? []).map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
          {helpEl}
        </div>
      );

    case TemplateFieldType.MULTISELECT: {
      const selected = Array.isArray(value) ? (value as string[]) : [];
      const toggle = (opt: string, on: boolean) => {
        const next = on ? [...selected.filter((s) => s !== opt), opt] : selected.filter((s) => s !== opt);
        onChange(next);
      };
      return (
        <div>
          {labelEl}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', padding: '0.5rem 0.625rem', background: theme.colors.surface, border: theme.borders.default, borderRadius: theme.radius.md }}>
            {(field.options ?? []).map((opt) => (
              <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: disabled ? 'default' : 'pointer', fontSize: theme.font.sizeSm, color: theme.colors.text }}>
                <input type="checkbox"
                  checked={selected.includes(opt)}
                  onChange={(e) => toggle(opt, e.target.checked)}
                  disabled={disabled}
                />
                {opt}
              </label>
            ))}
            {(field.options ?? []).length === 0 && (
              <span style={{ fontSize: theme.font.sizeXs, color: theme.colors.textMuted, fontStyle: 'italic' }}>{t('settings:formRenderer.noOptions', { defaultValue: 'Aucune option configurée.' })}</span>
            )}
          </div>
          {helpEl}
        </div>
      );
    }

    case TemplateFieldType.RADIO:
      return (
        <div>
          {labelEl}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            {(field.options ?? []).map((opt) => (
              <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: disabled ? 'default' : 'pointer', fontSize: theme.font.sizeSm, color: theme.colors.text }}>
                <input type="radio" name={field.id}
                  checked={(v as string) === opt}
                  onChange={() => onChange(opt)}
                  disabled={disabled}
                />
                {opt}
              </label>
            ))}
            {(field.options ?? []).length === 0 && (
              <span style={{ fontSize: theme.font.sizeXs, color: theme.colors.textMuted, fontStyle: 'italic' }}>{t('settings:formRenderer.noOptions', { defaultValue: 'Aucune option configurée.' })}</span>
            )}
          </div>
          {helpEl}
        </div>
      );

    case TemplateFieldType.DATE:
      return (
        <div>
          {labelEl}
          <input type="date"
            value={(v as string) ?? ''}
            onChange={(e) => onChange(e.target.value || null)}
            disabled={disabled} style={inputStyle}
          />
          {helpEl}
        </div>
      );

    case TemplateFieldType.TIME:
      return (
        <div>
          {labelEl}
          <input type="time"
            value={(v as string) ?? ''}
            onChange={(e) => onChange(e.target.value || null)}
            disabled={disabled} style={inputStyle}
          />
          {helpEl}
        </div>
      );

    case TemplateFieldType.DATETIME:
      return (
        <div>
          {labelEl}
          <input type="datetime-local"
            value={(v as string) ?? ''}
            onChange={(e) => onChange(e.target.value || null)}
            disabled={disabled} style={inputStyle}
          />
          {helpEl}
        </div>
      );

    case TemplateFieldType.GPS: {
      const g = asGps(value);
      const update = (next: Partial<GpsValue>) => {
        const merged: GpsValue = { ...g, ...next };
        if (merged.lat === null && merged.lng === null) onChange(null);
        else onChange(merged);
      };
      return (
        <div>
          {labelEl}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
            <input type="number" step="any" min={-90} max={90}
              value={g.lat === null ? '' : String(g.lat)}
              onChange={(e) => update({ lat: e.target.value === '' ? null : parseFloat(e.target.value) })}
              placeholder={t('settings:formRenderer.latitudePlaceholder', { defaultValue: 'Latitude' })} disabled={disabled} style={inputStyle}
            />
            <input type="number" step="any" min={-180} max={180}
              value={g.lng === null ? '' : String(g.lng)}
              onChange={(e) => update({ lng: e.target.value === '' ? null : parseFloat(e.target.value) })}
              placeholder={t('settings:formRenderer.longitudePlaceholder', { defaultValue: 'Longitude' })} disabled={disabled} style={inputStyle}
            />
          </div>
          <p style={{ ...formStyles.fieldHint }}>{t('settings:formRenderer.gpsHint', { defaultValue: 'Décimal — ex: 45.50170, -73.56730 (copier-coller depuis Google Maps).' })}</p>
          {helpEl}
        </div>
      );
    }

    case TemplateFieldType.TEXT:
    default:
      return (
        <div>
          {labelEl}
          <input type="text"
            value={(v as string) ?? ''}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder ?? ''} disabled={disabled} style={inputStyle}
          />
          {helpEl}
        </div>
      );
  }
}
