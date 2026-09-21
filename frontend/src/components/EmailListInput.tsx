import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { theme, formStyles } from '../theme';

interface Props {
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  id?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Chips input for a list of emails : Enter, comma, space or blur adds ; ✕ removes. */
export default function EmailListInput({ value, onChange, placeholder, id }: Props) {
  const { t } = useTranslation('common');
  const [draft, setDraft] = useState('');
  const [invalid, setInvalid] = useState(false);

  function commit() {
    const parts = draft.split(/[\s,;]+/).map((p) => p.trim().toLowerCase()).filter(Boolean);
    if (parts.length === 0) return;
    const bad = parts.find((p) => !EMAIL_RE.test(p));
    if (bad) { setInvalid(true); return; }
    onChange([...new Set([...value, ...parts])]);
    setDraft('');
    setInvalid(false);
  }

  return (
    <div>
      {value.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginBottom: '0.35rem' }}>
          {value.map((e) => (
            <span key={e} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', background: theme.colors.surfaceAlt, border: `1px solid ${theme.colors.border}`, borderRadius: theme.radius.full, padding: '0.1rem 0.6rem', fontSize: theme.font.sizeSm }}>
              ✉ {e}
              <button type="button" onClick={() => onChange(value.filter((x) => x !== e))} aria-label={`× ${e}`} style={{ background: 'none', border: 'none', cursor: 'pointer', color: theme.colors.textMuted, padding: 0, lineHeight: 1 }}>×</button>
            </span>
          ))}
        </div>
      )}
      <input
        id={id}
        type="text"
        value={draft}
        onChange={(e) => { setDraft(e.target.value); setInvalid(false); }}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',' || e.key === ';') { e.preventDefault(); commit(); } }}
        onBlur={commit}
        placeholder={placeholder ?? t('emailList.placeholder', { defaultValue: 'Ajouter un courriel puis Entrée' })}
        style={{ ...formStyles.input, ...(invalid ? { borderColor: theme.colors.danger } : {}) }}
      />
      {invalid && <p style={{ margin: '0.2rem 0 0', color: theme.colors.danger, fontSize: theme.font.sizeXs }}>{t('emailList.invalid', { defaultValue: 'Courriel invalide.' })}</p>}
    </div>
  );
}
