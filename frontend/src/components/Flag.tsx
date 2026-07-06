/**
 * Inline SVG flags for the FR / EN language picker (B10.2).
 *
 * Windows and many Linux browsers don't ship the Regional Indicator
 * emoji glyphs, so `🇫🇷` and `🇬🇧` render as bare letter pairs (« FR »,
 * « GB »). SVG is the only rendering path that works everywhere.
 *
 * These are just the two flags we ship in the UI (FR + EN). If more
 * languages get added, extend or refactor to a lookup.
 */

interface FlagProps {
  width?: number;
  height?: number;
  className?: string;
  style?: React.CSSProperties;
}

const DEFAULT_WIDTH = 20;
const DEFAULT_HEIGHT = 14;

const BORDER: React.CSSProperties = {
  borderRadius: 2,
  border: '1px solid rgba(0, 0, 0, 0.08)',
  display: 'inline-block',
  verticalAlign: 'middle',
};

export function FlagFr({
  width = DEFAULT_WIDTH,
  height = DEFAULT_HEIGHT,
  className,
  style,
}: FlagProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 3 2"
      width={width}
      height={height}
      className={className}
      style={{ ...BORDER, ...style }}
      aria-label="Français"
    >
      <rect width="1" height="2" x="0" fill="#0055A4" />
      <rect width="1" height="2" x="1" fill="#FFFFFF" />
      <rect width="1" height="2" x="2" fill="#EF4135" />
    </svg>
  );
}

export function FlagEn({
  width = DEFAULT_WIDTH,
  height = DEFAULT_HEIGHT,
  className,
  style,
}: FlagProps) {
  // Union Jack — simplified enough to be crisp at 20×14 while keeping the
  // saltire pattern recognisable.
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 60 30"
      width={width}
      height={height}
      className={className}
      style={{ ...BORDER, ...style }}
      aria-label="English"
    >
      <clipPath id="uk-clip">
        <rect width="60" height="30" />
      </clipPath>
      <g clipPath="url(#uk-clip)">
        <rect width="60" height="30" fill="#012169" />
        <path d="M0,0 L60,30 M60,0 L0,30" stroke="#FFFFFF" strokeWidth="6" />
        <path
          d="M0,0 L60,30 M60,0 L0,30"
          stroke="#C8102E"
          strokeWidth="4"
          clipPath="polygon(50% 50%, 100% 0, 100% 50%, 50% 50%, 100% 100%, 50% 100%, 50% 50%, 0 100%, 0 50%, 50% 50%, 0 0)"
        />
        <path d="M30,0 v30 M0,15 h60" stroke="#FFFFFF" strokeWidth="10" />
        <path d="M30,0 v30 M0,15 h60" stroke="#C8102E" strokeWidth="6" />
      </g>
    </svg>
  );
}

/**
 * Convenience helper: pick the flag component for a locale.
 */
export function FlagFor({
  locale,
  ...rest
}: { locale: 'fr' | 'en' } & FlagProps) {
  return locale === 'fr' ? <FlagFr {...rest} /> : <FlagEn {...rest} />;
}
