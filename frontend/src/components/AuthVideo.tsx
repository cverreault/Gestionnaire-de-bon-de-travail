import { useEffect, useState } from 'react';
import api from '../services/api';
import { theme } from '../theme';

interface Props {
  /** API path, e.g. `/attachments/:id/content` (bearer token added by the axios client). */
  src: string;
  style?: React.CSSProperties;
  /** Poster-only mode : no controls, click handled by the parent (grid tile). */
  preview?: boolean;
  onClick?: () => void;
}

/**
 * B56 — <video> for API-protected content : fetched as a blob through the
 * axios client (bearer token), played from an object URL, revoked on unmount.
 */
export default function AuthVideo({ src, style, preview = false, onClick }: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let objectUrl: string | null = null;
    let alive = true;
    api
      .get<Blob>(src, { responseType: 'blob' })
      .then((res) => {
        if (!alive) return;
        objectUrl = URL.createObjectURL(res.data);
        setUrl(objectUrl);
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src]);
  if (failed) return <div style={{ ...style, display: 'flex', alignItems: 'center', justifyContent: 'center', color: theme.colors.textLight, background: theme.colors.surfaceAlt }}>⚠️</div>;
  if (!url) return <div style={{ ...style, background: theme.colors.surfaceAlt, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>🎬</div>;
  if (preview) {
    return (
      <div onClick={onClick} style={{ ...style, position: 'relative', overflow: 'hidden', background: '#000' }}>
        <video src={url} muted preload="metadata" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '2rem', textShadow: '0 1px 4px rgba(0,0,0,0.6)' }}>▶</span>
      </div>
    );
  }
  return <video src={url} controls autoPlay playsInline style={style} onClick={(e) => e.stopPropagation()} />;
}
