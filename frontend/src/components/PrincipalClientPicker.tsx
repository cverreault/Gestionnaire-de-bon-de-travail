import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useV3Clients } from '../hooks/useClients';
import { ClientType, type PrincipalClientRef } from '../types';
import { theme, formStyles, buttonStyles } from '../theme';

interface Props {
  value: PrincipalClientRef | null;
  onChange: (value: PrincipalClientRef | null) => void;
  /** The client of the work order / the client being edited: never selectable as its own principal. */
  excludeId?: string | null;
  label?: string;
  hint?: string;
}

export function principalDisplayName(p: PrincipalClientRef): string {
  return p.companyName?.trim() || `${p.firstName} ${p.lastName}`.trim();
}

/**
 * B42 — « Mandaté par » / « Client de » : picks the principal (donneur d'ordre)
 * among the tenant's clients. Clients typed PRINCIPAL are listed first; any
 * other client can be found by search. Purely additive: null = no subcontracting.
 */
export default function PrincipalClientPicker({ value, onChange, excludeId, label, hint }: Props) {
  const { t } = useTranslation('clients');
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const principals = useV3Clients({ clientType: ClientType.PRINCIPAL, limit: 50 });
  const searched = useV3Clients(debounced.length >= 2 ? { search: debounced, limit: 10 } : undefined);

  const options: PrincipalClientRef[] = (debounced.length >= 2 ? searched.data?.data : principals.data?.data ?? [])
    ?.filter((c) => c.id !== excludeId)
    .map((c) => ({ id: c.id, firstName: c.firstName, lastName: c.lastName, companyName: c.companyName ?? null, clientType: c.clientType })) ?? [];

  return (
    <div style={{ position: 'relative' }}>
      <label style={{ ...formStyles.label }}>
        🤝 {label ?? t('fields.principalClient', { defaultValue: 'Client de (donneur d’ordre)' })}
        <span style={{ marginLeft: 6, color: theme.colors.textMuted, fontWeight: theme.font.weightNormal, fontSize: theme.font.sizeXs }}>
          {hint ?? t('fields.principalClientHint', { defaultValue: 'optionnel — sous-traitance' })}
        </span>
      </label>
      {value ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <span style={{ fontSize: theme.font.sizeSm, fontWeight: theme.font.weightSemibold, color: theme.colors.text }}>
            {principalDisplayName(value)}
          </span>
          <button type="button" onClick={() => onChange(null)} style={{ ...buttonStyles.secondary, ...buttonStyles.sm }}>
            {t('fields.principalClear', { defaultValue: 'Retirer' })}
          </button>
        </div>
      ) : (
        <>
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 200)}
            placeholder={t('fields.principalSearch', { defaultValue: 'Rechercher un donneur d’ordre…' })}
            style={{ ...formStyles.input, boxSizing: 'border-box' }}
          />
          {open && options.length > 0 && (
            <div
              style={{
                position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 40, marginTop: 4,
                background: theme.colors.surface, border: theme.borders.default, borderRadius: theme.radius.md,
                boxShadow: theme.shadows.md, maxHeight: 220, overflowY: 'auto',
              }}
            >
              {options.map((c) => (
                <div
                  key={c.id}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => { onChange(c); setSearch(''); setOpen(false); }}
                  style={{ padding: '0.45rem 0.75rem', cursor: 'pointer', fontSize: theme.font.sizeSm, color: theme.colors.text }}
                >
                  {c.clientType === ClientType.PRINCIPAL ? '🤝 ' : '👤 '}{principalDisplayName(c)}
                  {c.companyName && <span style={{ color: theme.colors.textMuted }}> · {c.firstName} {c.lastName}</span>}
                </div>
              ))}
            </div>
          )}
          {open && options.length === 0 && debounced.length >= 2 && !searched.isFetching && (
            <div style={{ fontSize: theme.font.sizeXs, color: theme.colors.textMuted, marginTop: 4 }}>
              {t('fields.principalNoResult', { defaultValue: 'Aucun client trouvé' })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
