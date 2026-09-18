import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCreateV3Client, useV3Clients } from '../hooks/useClients';
import { ClientType, type PrincipalClientRef } from '../types';
import { theme, formStyles, buttonStyles } from '../theme';
import { stripAccentsLower } from '../utils/localizedText';

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

function toRef(c: { id: string; firstName: string; lastName: string; companyName?: string | null; clientType: ClientType }): PrincipalClientRef {
  return { id: c.id, firstName: c.firstName, lastName: c.lastName, companyName: c.companyName ?? null, clientType: c.clientType };
}

/**
 * B42 — « Mandaté par » / « Client de » : a dropdown of the tenant's
 * principals (clients typed « Donneur d'ordre »). Typing filters that list
 * locally (accent-insensitive); with no local match, any other client is
 * searched on the server. A principal can be created inline without leaving
 * the form.
 */
export default function PrincipalClientPicker({ value, onChange, excludeId, label, hint }: Props) {
  const { t } = useTranslation('clients');
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState({ companyName: '', firstName: '', lastName: '', phone: '', email: '' });
  const createClient = useCreateV3Client();

  const principals = useV3Clients({ clientType: ClientType.PRINCIPAL, limit: 100 });
  const needle = stripAccentsLower(query.trim());
  // The client of the form is itself a principal: it is excluded (a principal
  // cannot mandate itself) and we say so instead of showing an empty list.
  const excludedSelf = (principals.data?.data ?? []).find((c) => c.id === excludeId) ?? null;
  const local = useMemo(
    () =>
      (principals.data?.data ?? [])
        .filter((c) => c.id !== excludeId)
        .map(toRef)
        .filter((c) => !needle || stripAccentsLower(`${principalDisplayName(c)} ${c.firstName} ${c.lastName}`).includes(needle))
        .sort((a, b) => principalDisplayName(a).localeCompare(principalDisplayName(b), 'fr')),
    [principals.data, excludeId, needle],
  );
  // Server-side search across every client only when the local list has nothing.
  const wide = useV3Clients(needle.length >= 2 && local.length === 0 ? { search: query.trim(), limit: 10 } : undefined);
  const wideOptions = local.length === 0 && needle.length >= 2
    ? (wide.data?.data ?? []).filter((c) => c.id !== excludeId).map(toRef)
    : [];
  const options = local.length > 0 ? local : wideOptions;

  function pick(c: PrincipalClientRef) {
    onChange(c);
    setQuery('');
    setOpen(false);
    setCreating(false);
  }

  async function createPrincipal() {
    const companyName = draft.companyName.trim();
    const firstName = draft.firstName.trim() || companyName;
    const lastName = draft.lastName.trim() || '—';
    if (!companyName && !draft.firstName.trim()) return;
    const created = await createClient.mutateAsync({
      firstName,
      lastName,
      companyName: companyName || undefined,
      phone: draft.phone.trim() || undefined,
      email: draft.email.trim() || undefined,
      clientType: ClientType.PRINCIPAL,
    });
    setDraft({ companyName: '', firstName: '', lastName: '', phone: '', email: '' });
    pick(toRef(created));
  }

  const labelText = label ?? t('fields.principalClient', { defaultValue: 'Client de (donneur d’ordre)' });

  return (
    <div style={{ position: 'relative' }}>
      <label style={{ ...formStyles.label }}>
        🤝 {labelText}
        <span style={{ marginLeft: 6, color: theme.colors.textMuted, fontWeight: theme.font.weightNormal, fontSize: theme.font.sizeXs }}>
          {hint ?? t('fields.principalClientHint', { defaultValue: 'optionnel — sous-traitance' })}
        </span>
      </label>

      {value ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <span style={{ fontSize: theme.font.sizeSm, fontWeight: theme.font.weightSemibold, color: theme.colors.text }}>
            🤝 {principalDisplayName(value)}
          </span>
          <button type="button" onClick={() => onChange(null)} style={{ ...buttonStyles.secondary, ...buttonStyles.sm }}>
            {t('fields.principalClear', { defaultValue: 'Retirer' })}
          </button>
        </div>
      ) : (
        <div style={{ position: 'relative' }}>
          <div style={{ position: 'relative' }}>
            <input
              value={query}
              onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
              onFocus={() => setOpen(true)}
              onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false); if (e.key === 'Enter' && options[0]) { e.preventDefault(); pick(options[0]); } }}
              placeholder={t('fields.principalSearch', { defaultValue: 'Choisir ou rechercher un donneur d’ordre…' })}
              style={{ ...formStyles.input, boxSizing: 'border-box', paddingRight: '2rem' }}
              role="combobox"
              aria-expanded={open}
            />
            <button
              type="button"
              aria-label={t('fields.principalToggle', { defaultValue: 'Ouvrir la liste' })}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setOpen((o) => !o)}
              style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'transparent', cursor: 'pointer', color: theme.colors.textMuted, fontSize: 12 }}
            >
              {open ? '▲' : '▼'}
            </button>
          </div>

          {open && (
            <div
              onMouseDown={(e) => e.preventDefault()}
              style={{
                position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 40, marginTop: 4,
                background: theme.colors.surface, border: theme.borders.default, borderRadius: theme.radius.md,
                boxShadow: theme.shadows.md, maxHeight: 260, overflowY: 'auto',
              }}
            >
              {options.map((c) => (
                <div
                  key={c.id}
                  onClick={() => pick(c)}
                  style={{ padding: '0.45rem 0.75rem', cursor: 'pointer', fontSize: theme.font.sizeSm, color: theme.colors.text }}
                >
                  {c.clientType === ClientType.PRINCIPAL ? '🤝 ' : '👤 '}{principalDisplayName(c)}
                  {c.companyName && <span style={{ color: theme.colors.textMuted }}> · {c.firstName} {c.lastName}</span>}
                </div>
              ))}
              {excludedSelf && (
                <div style={{ padding: '0.45rem 0.75rem', fontSize: theme.font.sizeXs, color: theme.colors.warning, borderBottom: theme.borders.default }}>
                  ⚠️ {t('fields.principalSelfExcluded', {
                    defaultValue: '{{name}} est déjà le client de ce BT : un donneur d’ordre ne peut pas se mandater lui-même. Choisissez comme client la personne chez qui la job est faite, puis {{name}} ici.',
                    name: principalDisplayName(toRef(excludedSelf)),
                  })}
                </div>
              )}
              {options.length === 0 && (
                <div style={{ padding: '0.45rem 0.75rem', fontSize: theme.font.sizeXs, color: theme.colors.textMuted }}>
                  {principals.isLoading || wide.isFetching
                    ? t('fields.principalLoading', { defaultValue: 'Chargement…' })
                    : needle
                    ? t('fields.principalNoResult', { defaultValue: 'Aucun client trouvé' })
                    : excludedSelf
                    ? t('fields.principalNoOther', { defaultValue: 'Aucun autre donneur d’ordre.' })
                    : t('fields.principalEmpty', { defaultValue: 'Aucun donneur d’ordre pour l’instant.' })}
                </div>
              )}
              <div
                onClick={() => { setCreating(true); setOpen(false); }}
                style={{ padding: '0.5rem 0.75rem', cursor: 'pointer', fontSize: theme.font.sizeSm, color: theme.colors.primary, borderTop: theme.borders.default, fontWeight: theme.font.weightSemibold }}
              >
                ➕ {t('fields.principalCreate', { defaultValue: 'Créer un donneur d’ordre' })}{needle ? ` « ${query.trim()} »` : ''}
              </div>
            </div>
          )}

          {creating && (
            <div style={{ marginTop: '0.5rem', padding: '0.75rem', border: theme.borders.default, borderRadius: theme.radius.md, background: theme.colors.surfaceAlt }}>
              <p style={{ margin: '0 0 0.5rem', fontSize: theme.font.sizeSm, fontWeight: theme.font.weightSemibold, color: theme.colors.text }}>
                ➕ {t('fields.principalCreate', { defaultValue: 'Créer un donneur d’ordre' })}
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: '0.5rem' }}>
                <input style={{ ...formStyles.input }} placeholder={t('fields.companyName', { defaultValue: 'Entreprise' })} value={draft.companyName || query.trim()} onChange={(e) => setDraft({ ...draft, companyName: e.target.value })} />
                <input style={{ ...formStyles.input }} placeholder={t('fields.firstName', { defaultValue: 'Prénom du contact' })} value={draft.firstName} onChange={(e) => setDraft({ ...draft, firstName: e.target.value })} />
                <input style={{ ...formStyles.input }} placeholder={t('fields.lastName', { defaultValue: 'Nom du contact' })} value={draft.lastName} onChange={(e) => setDraft({ ...draft, lastName: e.target.value })} />
                <input style={{ ...formStyles.input }} placeholder={t('fields.phone', { defaultValue: 'Téléphone' })} value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} />
                <input style={{ ...formStyles.input }} type="email" placeholder={t('fields.email', { defaultValue: 'Courriel' })} value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} />
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setCreating(false)} style={{ ...buttonStyles.secondary, ...buttonStyles.sm }}>
                  {t('fields.principalCancel', { defaultValue: 'Annuler' })}
                </button>
                <button
                  type="button"
                  onClick={() => void createPrincipal()}
                  disabled={createClient.isPending || !(draft.companyName.trim() || query.trim() || draft.firstName.trim())}
                  style={{ ...buttonStyles.primary, ...buttonStyles.sm }}
                >
                  {createClient.isPending
                    ? t('fields.principalCreating', { defaultValue: 'Création…' })
                    : t('fields.principalCreateConfirm', { defaultValue: 'Créer et sélectionner' })}
                </button>
              </div>
              {createClient.isError && (
                <p style={{ margin: '0.5rem 0 0', fontSize: theme.font.sizeXs, color: theme.colors.danger }}>
                  {t('fields.principalCreateError', { defaultValue: 'Création impossible, vérifiez les champs.' })}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
