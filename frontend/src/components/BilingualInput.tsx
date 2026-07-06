import { theme, formStyles } from '../theme';
import { FlagFr, FlagEn } from './Flag';

/**
 * B10.2 — Two side-by-side text inputs for a bilingual FR/EN config field.
 *
 * Use in admin forms that create/edit configuration entities (task types,
 * statuses, transitions, templates, client/address types…). Reads /
 * writes two independent strings so the admin can compose both languages
 * in one go.
 *
 * ```
 * <BilingualInput
 *   label={t('settings:taskTypeName')}
 *   fr={nameFr} onFrChange={setNameFr}
 *   en={nameEn} onEnChange={setNameEn}
 * />
 * ```
 *
 * Textarea variant (`multiline`) for descriptions.
 */
export default function BilingualInput({
  label,
  fr,
  en,
  onFrChange,
  onEnChange,
  placeholderFr,
  placeholderEn,
  multiline,
  required,
  maxLength = 200,
}: {
  label: string;
  fr: string;
  en: string;
  onFrChange: (v: string) => void;
  onEnChange: (v: string) => void;
  placeholderFr?: string;
  placeholderEn?: string;
  multiline?: boolean;
  required?: boolean;
  maxLength?: number;
}) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ ...formStyles.label, marginBottom: 4 }}>
        {label}
        {required && <span style={{ color: theme.colors.danger }}> *</span>}
      </label>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 8,
        }}
      >
        <SingleLocale
          locale="fr"
          value={fr}
          onChange={onFrChange}
          placeholder={placeholderFr ?? 'Français'}
          multiline={multiline}
          maxLength={maxLength}
        />
        <SingleLocale
          locale="en"
          value={en}
          onChange={onEnChange}
          placeholder={placeholderEn ?? 'English'}
          multiline={multiline}
          maxLength={maxLength}
        />
      </div>
    </div>
  );
}

function SingleLocale({
  locale,
  value,
  onChange,
  placeholder,
  multiline,
  maxLength,
}: {
  locale: 'fr' | 'en';
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
  maxLength: number;
}) {
  const commonStyle: React.CSSProperties = {
    ...formStyles.input,
    marginTop: 0,
    paddingLeft: 34,
  };
  const wrapperStyle: React.CSSProperties = { position: 'relative' };
  const flagWrapperStyle: React.CSSProperties = {
    position: 'absolute',
    left: 8,
    top: multiline ? 8 : '50%',
    transform: multiline ? undefined : 'translateY(-50%)',
    pointerEvents: 'none',
    lineHeight: 0,
  };
  return (
    <div style={wrapperStyle}>
      <span style={flagWrapperStyle}>
        {locale === 'fr'
          ? <FlagFr width={18} height={12} />
          : <FlagEn width={18} height={12} />}
      </span>
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          maxLength={maxLength}
          style={{ ...commonStyle, minHeight: 60, fontFamily: 'inherit' }}
        />
      ) : (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          maxLength={maxLength}
          style={commonStyle}
        />
      )}
    </div>
  );
}
