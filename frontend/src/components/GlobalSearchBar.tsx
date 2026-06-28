import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useGlobalSearch } from '../hooks/useGlobalSearch';
import type { SearchHit, SearchHitType } from '../services/search.service';
import { theme } from '../theme';

/**
 * Recherche globale top-bar (ADMIN + DISPATCHER seulement).
 *
 * - Debounce 250 ms côté input.
 * - Dropdown groupé par type (BT / clients / adresses).
 * - Navigation clavier (↑ ↓ Enter Escape).
 * - Click extérieur → fermeture.
 * - Raccourci Ctrl/⌘ + K → focus.
 */
export default function GlobalSearchBar() {
  const { t } = useTranslation('common');
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [input, setInput] = useState('');
  const [debounced, setDebounced] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  // Debounce input → query
  useEffect(() => {
    const id = setTimeout(() => setDebounced(input), 250);
    return () => clearTimeout(id);
  }, [input]);

  const { data, isFetching } = useGlobalSearch(debounced);

  // Ctrl/⌘ + K → focus
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
    }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Click outside → close
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const hits = data?.hits ?? [];

  function pick(hit: SearchHit) {
    setOpen(false);
    setInput('');
    setDebounced('');
    navigate(hit.url);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      setOpen(false);
      inputRef.current?.blur();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(hits.length - 1, i + 1));
      setOpen(true);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(-1, i - 1));
    } else if (e.key === 'Enter') {
      if (activeIndex >= 0 && activeIndex < hits.length) {
        e.preventDefault();
        pick(hits[activeIndex]);
      }
    }
  }

  const showDropdown = open && debounced.length >= 2;

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%', maxWidth: '460px' }}>
      <div style={{ position: 'relative' }}>
        <span style={{
          position: 'absolute',
          left: '0.7rem',
          top: '50%',
          transform: 'translateY(-50%)',
          color: theme.colors.textMuted,
          fontSize: '0.95rem',
          pointerEvents: 'none',
        }}>🔍</span>
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => { setInput(e.target.value); setActiveIndex(-1); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={t('search.placeholder', { defaultValue: 'Rechercher BT, client, adresse…  (Ctrl+K)' })}
          style={{
            width: '100%',
            padding: '0.5rem 0.75rem 0.5rem 2.1rem',
            fontSize: theme.font.sizeSm,
            color: theme.colors.text,
            background: theme.colors.surface,
            border: theme.borders.default,
            borderRadius: theme.radius.md,
            outline: 'none',
            boxShadow: theme.shadows.sm,
            transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
          }}
        />
      </div>

      {showDropdown && (
        <SearchDropdown
          hits={hits}
          isFetching={isFetching}
          activeIndex={activeIndex}
          onPick={pick}
        />
      )}
    </div>
  );
}

// ── Dropdown ─────────────────────────────────────────────────────────────────

function SearchDropdown({
  hits,
  isFetching,
  activeIndex,
  onPick,
}: {
  hits: SearchHit[];
  isFetching: boolean;
  activeIndex: number;
  onPick: (hit: SearchHit) => void;
}) {
  const { t } = useTranslation('common');

  // Grouper par type tout en respectant l'ordre global (pour le clavier).
  const groups: { type: SearchHitType; rows: { hit: SearchHit; index: number }[] }[] = [];
  hits.forEach((hit, index) => {
    let g = groups.find((x) => x.type === hit.type);
    if (!g) {
      g = { type: hit.type, rows: [] };
      groups.push(g);
    }
    g.rows.push({ hit, index });
  });

  return (
    <div
      role="listbox"
      style={{
        position: 'absolute',
        top: 'calc(100% + 0.375rem)',
        left: 0,
        right: 0,
        background: theme.colors.surface,
        border: theme.borders.default,
        borderRadius: theme.radius.md,
        boxShadow: theme.shadows.lg,
        maxHeight: '60vh',
        overflowY: 'auto',
        zIndex: theme.zIndex.dropdown,
      }}
    >
      {isFetching && hits.length === 0 && (
        <p style={{ padding: '0.75rem', margin: 0, fontSize: theme.font.sizeSm, color: theme.colors.textMuted }}>
          {t('search.searching', { defaultValue: 'Recherche…' })}
        </p>
      )}

      {!isFetching && hits.length === 0 && (
        <p style={{ padding: '0.75rem', margin: 0, fontSize: theme.font.sizeSm, color: theme.colors.textMuted, fontStyle: 'italic' }}>
          {t('search.noResults', { defaultValue: 'Aucun résultat.' })}
        </p>
      )}

      {groups.map((g) => (
        <div key={g.type}>
          <p style={{
            margin: 0,
            padding: '0.4rem 0.75rem 0.25rem',
            fontSize: '0.65rem',
            color: theme.colors.textMuted,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            fontWeight: theme.font.weightSemibold,
            background: theme.colors.surfaceAlt,
            borderBottom: theme.borders.light,
          }}>
            {t(`search.types.${g.type}`, {
              defaultValue: g.type === 'workOrder' ? 'Bons de travail' :
                            g.type === 'client' ? 'Clients' :
                            'Adresses',
            })}
          </p>
          {g.rows.map(({ hit, index }) => (
            <button
              key={`${hit.type}-${hit.id}`}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); onPick(hit); }}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '0.5rem 0.75rem',
                border: 'none',
                background: index === activeIndex ? theme.colors.primaryLight : 'transparent',
                cursor: 'pointer',
                borderBottom: theme.borders.light,
                transition: 'background 0.1s ease',
              }}
            >
              <div style={{
                fontSize: theme.font.sizeSm,
                color: theme.colors.text,
                fontWeight: theme.font.weightMedium,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}>
                {hit.title}
              </div>
              {hit.subtitle && (
                <div style={{
                  fontSize: theme.font.sizeXs,
                  color: theme.colors.textMuted,
                  marginTop: '0.1rem',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}>
                  {hit.subtitle}
                </div>
              )}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
