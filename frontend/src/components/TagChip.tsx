import { badgeStyles } from '../theme';
import type { Tag } from '../types';

interface ChipProps {
  tag: Pick<Tag, 'id' | 'name' | 'color'>;
  size?: 'sm' | 'md';
  /** Optional remove affordance (pickers, forms). */
  onRemove?: () => void;
  title?: string;
}

/**
 * B44 — coloured pill for a tag : 10 % tint background, 20 % border, full colour text
 * (same technique as WorkOrderStatusBadge).
 */
export function TagChip({ tag, size = 'sm', onRemove, title }: ChipProps) {
  const color = tag.color || '#6b7280';
  return (
    <span
      title={title ?? tag.name}
      style={{
        ...badgeStyles.base,
        backgroundColor: color + '1A',
        color,
        border: `1px solid ${color}33`,
        fontSize: size === 'sm' ? '0.68rem' : '0.8rem',
        padding: size === 'sm' ? '0 0.45rem' : '0.15rem 0.6rem',
        lineHeight: size === 'sm' ? '1.1rem' : '1.4rem',
        maxWidth: '100%',
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0 }} />
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{tag.name}</span>
      {onRemove && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          aria-label={`× ${tag.name}`}
          style={{ background: 'none', border: 'none', color, cursor: 'pointer', padding: '0 0 0 0.15rem', fontSize: '0.8rem', lineHeight: 1 }}
        >
          ×
        </button>
      )}
    </span>
  );
}

interface ChipsProps {
  tags?: Pick<Tag, 'id' | 'name' | 'color'>[] | null;
  size?: 'sm' | 'md';
  /** Show at most N chips, then « +k ». */
  max?: number;
  wrap?: boolean;
}

/** Inline row of chips ; renders nothing when the list is empty. */
export function TagChips({ tags, size = 'sm', max, wrap = true }: ChipsProps) {
  if (!tags || tags.length === 0) return null;
  const shown = max ? tags.slice(0, max) : tags;
  const rest = tags.length - shown.length;
  return (
    <span style={{ display: 'inline-flex', gap: '0.25rem', flexWrap: wrap ? 'wrap' : 'nowrap', alignItems: 'center', verticalAlign: 'middle' }}>
      {shown.map((t) => <TagChip key={t.id} tag={t} size={size} />)}
      {rest > 0 && (
        <span title={tags.slice(shown.length).map((t) => t.name).join(', ')} style={{ fontSize: '0.68rem', opacity: 0.7 }}>
          +{rest}
        </span>
      )}
    </span>
  );
}

export default TagChip;
