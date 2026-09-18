import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { resolveAddress, suggestAddresses, type AddressSuggestion, type ResolvedAddress } from '../services/geo.service';
import { theme, formStyles } from '../theme';

interface Props {
  /** Called with the resolved address (fields + GPS) when a suggestion is picked. */
  onSelect: (address: ResolvedAddress) => void;
  disabled?: boolean;
}

const DEBOUNCE_MS = 300;

/**
 * Search box backed by Adresses Québec (B40). Type « 669 principale sainte-m »
 * (no need for « rue » — best-match suggestions),
 * pick a line, and the caller fills its form with number, street, city,
 * postal code and coordinates. Purely additive: the classic fields below
 * stay editable.
 */
export default function AddressAutocomplete({ onSelect, disabled }: Props) {
  const { t } = useTranslation('addresses');
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<AddressSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const q = query.trim();
    abortRef.current?.abort();
    if (q.length < 3) {
      setItems([]);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    const timer = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await suggestAddresses(q, controller.signal);
        if (!controller.signal.aborted) {
          setItems(res);
          setOpen(true);
          setActive(res.length > 0 ? 0 : -1);
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setItems([]);
          setError(t('autocomplete.unavailable', { defaultValue: 'Service d’adresses indisponible' }));
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, t]);

  // Close on outside click.
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  async function pick(s: AddressSuggestion) {
    setOpen(false);
    setLoading(true);
    setError(null);
    try {
      const resolved = await resolveAddress(s.text, s.magicKey);
      if (!resolved) {
        setError(t('autocomplete.notResolved', { defaultValue: 'Adresse non reconnue, complétez les champs manuellement' }));
        return;
      }
      setQuery(s.text);
      onSelect(resolved);
    } catch {
      setError(t('autocomplete.unavailable', { defaultValue: 'Service d’adresses indisponible' }));
    } finally {
      setLoading(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || items.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => (i + 1) % items.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => (i - 1 + items.length) % items.length);
    } else if (e.key === 'Enter' && active >= 0) {
      e.preventDefault();
      void pick(items[active]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  return (
    <div ref={rootRef} style={{ position: 'relative', marginBottom: '0.75rem' }}>
      <label style={{ ...formStyles.label }}>
        🔍 {t('autocomplete.label', { defaultValue: 'Rechercher une adresse (Adresses Québec)' })}
      </label>
      <input
        type="text"
        value={query}
        disabled={disabled}
        autoComplete="off"
        placeholder={t('autocomplete.placeholder', { defaultValue: 'Ex. : 451 principale sainte-marthe' })}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => items.length > 0 && setOpen(true)}
        onKeyDown={onKeyDown}
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        style={{ ...formStyles.input }}
      />
      <span style={{ fontSize: theme.font.sizeXs, color: theme.colors.textMuted }}>
        {loading
          ? t('autocomplete.searching', { defaultValue: 'Recherche…' })
          : t('autocomplete.hint', { defaultValue: 'Choisissez une suggestion pour remplir les champs et la position GPS.' })}
      </span>
      {error && (
        <div style={{ fontSize: theme.font.sizeXs, color: theme.colors.danger, marginTop: 2 }}>{error}</div>
      )}
      {open && items.length > 0 && (
        <ul
          role="listbox"
          style={{
            position: 'absolute',
            zIndex: 20,
            left: 0,
            right: 0,
            top: '100%',
            margin: 0,
            padding: '0.25rem 0',
            listStyle: 'none',
            background: theme.colors.surface,
            border: theme.borders.default,
            borderRadius: theme.radius.md,
            boxShadow: theme.shadows.md,
            maxHeight: 240,
            overflowY: 'auto',
          }}
        >
          {items.map((s, i) => (
            <li
              key={s.magicKey ?? s.text}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setActive(i)}
              onClick={() => void pick(s)}
              style={{
                padding: '0.45rem 0.75rem',
                cursor: 'pointer',
                fontSize: theme.font.sizeSm,
                color: theme.colors.text,
                background: i === active ? theme.colors.surfaceAlt : 'transparent',
              }}
            >
              📍 {s.text}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
