import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNotifications, useMarkRead, useMarkAllRead } from '../hooks/useNotifications';
import type { NotificationRow } from '../services/notifications.service';
import { formatDateTime } from '../utils/dateFormat';
import { theme } from '../theme';

/**
 * Top-bar bell with unread badge + dropdown.
 *
 * - Polls every 30s via useNotifications (B1.1.b).
 * - Click a notification → marks read + deep-links to aggregateId if it
 *   looks like a workOrderId (drive-by routing).
 * - "Tout marquer comme lu" runs the bulk endpoint.
 *
 * The dropdown closes on outside click and on Escape.
 */

function iconForType(type: string): string {
  if (type.startsWith('workOrder.')) return '📋';
  if (type.startsWith('auth.')) return '🔐';
  return '🔔';
}

function destination(n: NotificationRow): string | null {
  // Single rule for now — when the type starts with workOrder. we treat
  // aggregateId as a workOrderId and route through /bons-de-travail/:id.
  // Technicians get a different page; the router redirects appropriately.
  if (n.aggregateId && n.type.startsWith('workOrder.')) {
    return `/bons-de-travail/${n.aggregateId}`;
  }
  return null;
}

export default function NotificationsBell() {
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const { data, isLoading } = useNotifications(20);
  const markRead = useMarkRead();
  const markAllRead = useMarkAllRead();

  const items = data?.items ?? [];
  const unreadCount = data?.unreadCount ?? 0;

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
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

  function handleClick(n: NotificationRow) {
    if (!n.readAt) markRead.mutate(n.id);
    const url = destination(n);
    if (url) {
      setOpen(false);
      navigate(url);
    }
  }

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <button
        type="button"
        aria-label={`Notifications (${unreadCount} non lue${unreadCount > 1 ? 's' : ''})`}
        onClick={() => setOpen((v) => !v)}
        style={{
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          fontSize: '1.4rem',
          padding: '0.35rem 0.5rem',
          position: 'relative',
          lineHeight: 1,
        }}
      >
        🔔
        {unreadCount > 0 && (
          <span
            style={{
              position: 'absolute',
              top: 2,
              right: 2,
              background: theme.colors.danger ?? '#dc2626',
              color: '#fff',
              fontSize: '0.65rem',
              fontWeight: theme.font.weightBold,
              borderRadius: '999px',
              padding: '0 0.35rem',
              minWidth: '1rem',
              textAlign: 'center',
              lineHeight: '1rem',
            }}
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          style={{
            position: 'absolute',
            top: 'calc(100% + 0.4rem)',
            right: 0,
            width: '360px',
            maxHeight: '60vh',
            overflowY: 'auto',
            background: theme.colors.surface,
            border: theme.borders.default,
            borderRadius: theme.radius.md,
            boxShadow: theme.shadows.lg,
            zIndex: theme.zIndex.dropdown ?? 1000,
          }}
        >
          <header
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '0.6rem 0.875rem',
              borderBottom: theme.borders.light,
              background: theme.colors.surfaceAlt,
            }}
          >
            <span style={{ fontSize: theme.font.sizeSm, fontWeight: theme.font.weightSemibold, color: theme.colors.text }}>
              Notifications {unreadCount > 0 && `(${unreadCount} non lue${unreadCount > 1 ? 's' : ''})`}
            </span>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => markAllRead.mutate()}
                disabled={markAllRead.isPending}
                style={{
                  background: 'none',
                  border: 'none',
                  color: theme.colors.primary,
                  fontSize: theme.font.sizeXs,
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                Tout marquer lu
              </button>
            )}
          </header>

          {isLoading && (
            <p style={{ padding: '1rem', margin: 0, color: theme.colors.textMuted, fontSize: theme.font.sizeSm }}>
              Chargement…
            </p>
          )}

          {!isLoading && items.length === 0 && (
            <p style={{ padding: '1rem', margin: 0, color: theme.colors.textMuted, fontSize: theme.font.sizeSm, fontStyle: 'italic' }}>
              Aucune notification pour l'instant.
            </p>
          )}

          {items.map((n) => {
            const isUnread = !n.readAt;
            return (
              <button
                key={n.id}
                type="button"
                onClick={() => handleClick(n)}
                style={{
                  display: 'flex',
                  width: '100%',
                  gap: '0.6rem',
                  padding: '0.6rem 0.875rem',
                  background: isUnread ? theme.colors.primaryLight ?? '#eff6ff' : 'transparent',
                  border: 'none',
                  borderBottom: theme.borders.light,
                  textAlign: 'left',
                  cursor: 'pointer',
                  alignItems: 'flex-start',
                }}
              >
                <span style={{ fontSize: '1.2rem', lineHeight: 1.2 }}>{iconForType(n.type)}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{
                    margin: 0,
                    fontSize: theme.font.sizeSm,
                    fontWeight: isUnread ? theme.font.weightSemibold : theme.font.weightNormal,
                    color: theme.colors.text,
                  }}>
                    {n.title}
                  </p>
                  {n.body && (
                    <p style={{
                      margin: '0.2rem 0 0',
                      fontSize: theme.font.sizeXs,
                      color: theme.colors.textSecondary,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}>
                      {n.body}
                    </p>
                  )}
                  <p style={{
                    margin: '0.2rem 0 0',
                    fontSize: '0.65rem',
                    color: theme.colors.textMuted,
                  }}>
                    {formatDateTime(n.createdAt)}
                  </p>
                </div>
                {isUnread && (
                  <span
                    aria-hidden="true"
                    style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      background: theme.colors.primary,
                      marginTop: '0.4rem',
                      flexShrink: 0,
                    }}
                  />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
