import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { theme, buttonStyles } from '../theme';
import { useTags } from '../hooks/useSettings';
import type { Tag } from '../types';
import { TagChip } from './TagChip';

interface Props {
  value: string[];
  onChange: (next: string[]) => void;
  /** Compact filter style (button + popover) vs. form style (chips + popover). */
  variant?: 'filter' | 'form';
  placeholder?: string;
  /** Show inactive tags too (forms editing an entity that still carries one). */
  includeInactive?: boolean;
  disabled?: boolean;
  id?: string;
}

/**
 * B44 — multi-select of tags backed by GET /settings/tags.
 * Popover with a search box and checkboxes ; selected tags shown as chips.
 */
export default function TagPicker({ value, onChange, variant = 'form', placeholder, includeInactive = false, disabled, id }: Props) {
  const { t } = useTranslation();
  const { data: tags = [] } = useTags(includeInactive ? undefined : true);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const ref = useRef<HTMLDivElement | null>(null);
  const popRef = useRef<HTMLDivElement | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  // The popover is portaled to <body> (fixed position) so it is never clipped by a card
  // with overflow hidden, e.g. the work-order header.
  const [pos, setPos] = useState<{ top: number; left: number; maxHeight: number }>({ top: 0, left: 0, maxHeight: 280 });

  useLayoutEffect(() => {
    if (!open || !btnRef.current) return;
    function place() {
      const r = btnRef.current!.getBoundingClientRect();
      const below = window.innerHeight - r.bottom - 12;
      const maxHeight = Math.max(160, Math.min(320, below));
      setPos({ top: r.bottom + 4, left: Math.min(r.left, window.innerWidth - 240), maxHeight });
    }
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      const target = e.target as Node;
      if (ref.current?.contains(target) || popRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const byId = useMemo(() => new Map(tags.map((tg) => [tg.id, tg])), [tags]);
  const selected: Tag[] = value.map((vid) => byId.get(vid)).filter((x): x is Tag => !!x);
  const options = tags.filter((tg) => !q || tg.name.toLowerCase().includes(q.toLowerCase()));

  function toggle(tagId: string) {
    onChange(value.includes(tagId) ? value.filter((v) => v !== tagId) : [...value, tagId]);
  }

  const label = placeholder ?? t('common:tags.pick', { defaultValue: 'Tags' });

  return (
    <div ref={ref} style={{ position: 'relative', display: variant === 'filter' ? 'inline-block' : 'block' }}>
      {variant === 'form' && selected.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', marginBottom: '0.35rem' }}>
          {selected.map((tg) => (
            <TagChip key={tg.id} tag={tg} size="md" onRemove={disabled ? undefined : () => toggle(tg.id)} />
          ))}
        </div>
      )}
      <button
        id={id}
        ref={btnRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        style={{
          ...buttonStyles.secondary,
          fontSize: theme.font.sizeSm,
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.35rem',
          maxWidth: '100%',
          ...(variant === 'filter' && selected.length > 0 ? { borderColor: theme.colors.primary, color: theme.colors.primary } : {}),
        }}
      >
        {label}
        {variant === 'filter' && selected.length > 0 && (
          <span style={{ background: theme.colors.primary, color: '#fff', borderRadius: theme.radius.full, padding: '0 0.4rem', fontSize: theme.font.sizeXs }}>
            {selected.length}
          </span>
        )}
        <span aria-hidden style={{ fontSize: '0.6rem', opacity: 0.7 }}>▾</span>
      </button>

      {open && createPortal(
        <div
          ref={popRef}
          role="listbox"
          aria-multiselectable
          style={{
            position: 'fixed',
            zIndex: 1100,
            top: pos.top,
            left: pos.left,
            minWidth: 220,
            maxHeight: pos.maxHeight,
            overflowY: 'auto',
            background: theme.colors.surface,
            border: `1px solid ${theme.colors.border}`,
            borderRadius: theme.radius.md,
            boxShadow: theme.shadows.md,
            padding: '0.4rem',
          }}
        >
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('common:tags.search', { defaultValue: 'Rechercher un tag…' })}
            style={{ width: '100%', boxSizing: 'border-box', marginBottom: '0.35rem', padding: '0.3rem 0.5rem', fontSize: theme.font.sizeSm, border: `1px solid ${theme.colors.border}`, borderRadius: theme.radius.sm, background: theme.colors.background, color: theme.colors.text }}
          />
          {options.length === 0 && (
            <div style={{ fontSize: theme.font.sizeSm, opacity: 0.7, padding: '0.3rem 0.4rem' }}>
              {tags.length === 0
                ? t('common:tags.none', { defaultValue: 'Aucun tag défini. Un admin peut en créer dans Paramètres.' })
                : t('common:tags.noMatch', { defaultValue: 'Aucun tag ne correspond' })}
            </div>
          )}
          {options.map((tg) => {
            const checked = value.includes(tg.id);
            return (
              <label
                key={tg.id}
                role="option"
                aria-selected={checked}
                style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', padding: '0.3rem 0.4rem', cursor: 'pointer', borderRadius: theme.radius.sm, fontSize: theme.font.sizeSm }}
              >
                <input type="checkbox" checked={checked} onChange={() => toggle(tg.id)} />
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: tg.color, flexShrink: 0 }} />
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tg.name}</span>
                {tg.isActive === false && <span style={{ fontSize: theme.font.sizeXs, opacity: 0.6 }}>{t('common:tags.inactive', { defaultValue: 'inactif' })}</span>}
              </label>
            );
          })}
          {value.length > 0 && (
            <button type="button" onClick={() => onChange([])} style={{ ...buttonStyles.ghost, fontSize: theme.font.sizeXs, marginTop: '0.25rem', width: '100%' }}>
              {t('common:tags.clear', { defaultValue: 'Tout décocher' })}
            </button>
          )}
        </div>,
        document.body,
      )}
    </div>
  );
}
