import { theme, cardStyles } from '../theme';

/**
 * Loading skeleton for list-shaped pages (B7.10).
 *
 * Renders N shimmering rows to replace bare "Chargement…" text — the UI
 * stays laid out during the fetch so the reader's eye doesn't jump when
 * data lands.
 */
export interface SkeletonListProps {
  rows?: number;
  rowHeight?: number;
}

export default function SkeletonList({
  rows = 5,
  rowHeight = 44,
}: SkeletonListProps) {
  return (
    <div
      style={{
        ...cardStyles.card,
        padding: 0,
        overflow: 'hidden',
      }}
    >
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          style={{
            height: rowHeight,
            borderBottom:
              i < rows - 1 ? `1px solid ${theme.colors.border}` : 'none',
            padding: '0 16px',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <Shimmer width={140} />
          <Shimmer width={80} />
          <Shimmer width={60} />
          <Shimmer width={120} style={{ marginLeft: 'auto' }} />
        </div>
      ))}
      <style>{`
        @keyframes taskmgr-shimmer {
          0% { background-position: -400px 0; }
          100% { background-position: 400px 0; }
        }
      `}</style>
    </div>
  );
}

function Shimmer({
  width,
  style,
}: {
  width: number;
  style?: React.CSSProperties;
}) {
  return (
    <span
      style={{
        display: 'inline-block',
        height: 12,
        width,
        borderRadius: 4,
        background: `linear-gradient(90deg, ${theme.colors.surfaceAlt} 0%, ${theme.colors.border} 50%, ${theme.colors.surfaceAlt} 100%)`,
        backgroundSize: '800px 12px',
        animation: 'taskmgr-shimmer 1.4s ease-in-out infinite',
        ...style,
      }}
    />
  );
}
