import { useEffect, useRef, useState } from 'react';
import { theme, buttonStyles } from '../theme';

export interface ColumnDef<T> {
  id: string;
  label: string;
  /** When true, the column can't be hidden or reordered (e.g. actions). */
  locked?: boolean;
  /** Renderer for a single row's cell. */
  render: (row: T, index: number) => React.ReactNode;
  /** Optional td style override. */
  tdStyle?: React.CSSProperties;
}

interface Props {
  catalog: ColumnDef<unknown>[];
  /** Current ordered list of visible column ids (excluding locked). */
  visible: string[];
  onChange: (next: string[]) => void;
}

/**
 * Popover that lets the user toggle visibility and reorder columns.
 * Locked columns are not listed (always shown).
 */
export default function ColumnPicker({ catalog, visible, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const toggleable = catalog.filter((c) => !c.locked);

  function toggle(id: string) {
    onChange(visible.includes(id) ? visible.filter((v) => v !== id) : [...visible, id]);
  }

  function move(id: string, dir: -1 | 1) {
    const idx = visible.indexOf(id);
    if (idx < 0) return;
    const next = [...visible];
    const swapIdx = idx + dir;
    if (swapIdx < 0 || swapIdx >= next.length) return;
    [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
    onChange(next);
  }

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{ ...buttonStyles.secondary, fontSize: theme.font.sizeSm }}
      >
        ⚙️ Colonnes
      </button>
      {open && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            right: 0,
            marginTop: '0.25rem',
            background: theme.colors.surface,
            border: theme.borders.default,
            borderRadius: theme.radius.md,
            boxShadow: theme.shadows.lg,
            zIndex: 100,
            minWidth: '240px',
            maxHeight: '360px',
            overflowY: 'auto',
            padding: '0.5rem',
          }}
        >
          <p style={{ margin: '0 0 0.5rem', fontSize: theme.font.sizeXs, color: theme.colors.textMuted, fontWeight: theme.font.weightSemibold, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Colonnes affichées
          </p>
          {toggleable.map((col) => {
            const isVisible = visible.includes(col.id);
            const orderIdx = visible.indexOf(col.id);
            return (
              <div
                key={col.id}
                style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.25rem 0.4rem', borderRadius: theme.radius.sm }}
              >
                <input
                  type="checkbox"
                  checked={isVisible}
                  onChange={() => toggle(col.id)}
                />
                <span style={{ flex: 1, fontSize: theme.font.sizeSm, color: theme.colors.text }}>
                  {col.label}
                </span>
                {isVisible && (
                  <>
                    <button type="button" onClick={() => move(col.id, -1)} disabled={orderIdx <= 0}
                      style={{ background: 'none', border: 'none', cursor: orderIdx <= 0 ? 'default' : 'pointer', padding: '0 0.2rem', color: theme.colors.textMuted, opacity: orderIdx <= 0 ? 0.3 : 1 }}>↑</button>
                    <button type="button" onClick={() => move(col.id, 1)} disabled={orderIdx >= visible.length - 1}
                      style={{ background: 'none', border: 'none', cursor: orderIdx >= visible.length - 1 ? 'default' : 'pointer', padding: '0 0.2rem', color: theme.colors.textMuted, opacity: orderIdx >= visible.length - 1 ? 0.3 : 1 }}>↓</button>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
