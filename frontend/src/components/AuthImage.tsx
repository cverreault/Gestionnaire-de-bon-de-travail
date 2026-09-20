import { useEffect, useState } from 'react';
import api from '../services/api';
import { theme } from '../theme';

interface Props {
  /** API path, e.g. `/attachments/:id/content` (bearer token added by the axios client). */
  src: string;
  alt: string;
  style?: React.CSSProperties;
  onClick?: () => void;
}

/**
 * <img> for API-protected content : fetched as a blob through the axios
 * client (bearer token), rendered from an object URL, revoked on unmount.
 */
export default function AuthImage({ src, alt, style, onClick }: Props) {
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
  if (!url) return <div style={{ ...style, background: theme.colors.surfaceAlt }} />;
  return <img src={url} alt={alt} style={style} onClick={onClick} />;
}
