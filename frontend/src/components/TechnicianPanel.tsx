import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { User, WorkOrderStatus } from '../types';
import type { DispatchPayload } from './DispatchConfirmModal';
import { theme } from '../theme';

interface Props {
  technicians: User[];
  /** Active work orders per technician id. */
  counts: Record<string, number>;
  unassignedCount: number;
  selectedId?: string;
  onSelect: (technicianId: string | undefined) => void;
  onDropWorkOrder: (payload: DispatchPayload) => void;
}

/**
 * Left panel of the work-orders page : one row per active technician with
 * their active work-order count. Click filters the list ; a work order
 * dragged from the table or the board can be dropped here to assign it.
 */
export default function TechnicianPanel({ technicians, counts, unassignedCount, selectedId, onSelect, onDropWorkOrder }: Props) {
  const { t } = useTranslation('workOrders');
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('wo.panel.collapsed') === 'true');
  const [dragOver, setDragOver] = useState<string | null>(null);

  function toggle() {
    setCollapsed((c) => {
      localStorage.setItem('wo.panel.collapsed', String(!c));
      return !c;
    });
  }

  function drop(e: React.DragEvent, tech: User) {
    e.preventDefault();
    setDragOver(null);
    const workOrderId = e.dataTransfer.getData('workOrderId');
    if (!workOrderId) return;
    onDropWorkOrder({
      workOrderId,
      workOrderTitle: e.dataTransfer.getData('workOrderTitle') || workOrderId,
      technicianId: tech.id,
      technicianName: `${tech.firstName} ${tech.lastName}`,
      workOrderStatus: (e.dataTransfer.getData('workOrderStatus') as WorkOrderStatus) || undefined,
    });
  }

  if (collapsed) {
    return (
      <button onClick={toggle} title={t('panel.expand')} style={{ alignSelf: 'flex-start', border: theme.borders.default, background: theme.colors.surface, borderRadius: theme.radius.md, padding: '0.5rem', cursor: 'pointer', color: theme.colors.textSecondary }}>
        👷 ›
      </button>
    );
  }

  const rowStyle = (active: boolean, over: boolean): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem',
    padding: '0.5rem 0.75rem', borderRadius: theme.radius.md, cursor: 'pointer',
    background: over ? theme.colors.successLight : active ? theme.colors.primaryLight : 'transparent',
    border: over ? `1px dashed ${theme.colors.success}` : '1px solid transparent',
    color: theme.colors.text, fontSize: theme.font.sizeSm,
  });

  return (
    <aside style={{ width: 200, flexShrink: 0, background: theme.colors.surface, border: theme.borders.default, borderRadius: theme.radius.lg, padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.25rem', alignSelf: 'flex-start', position: 'sticky', top: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
        <span style={{ fontSize: theme.font.sizeXs, color: theme.colors.textMuted, fontWeight: theme.font.weightSemibold, textTransform: 'uppercase', letterSpacing: '0.04em' }}>👷 {t('panel.technicians')}</span>
        <button onClick={toggle} title={t('panel.collapse')} style={{ border: 'none', background: 'none', cursor: 'pointer', color: theme.colors.textMuted }}>‹</button>
      </div>
      <div onClick={() => onSelect(undefined)} style={rowStyle(!selectedId, false)}>
        <span>{t('panel.all')}</span>
        <span style={{ color: theme.colors.textMuted, fontSize: theme.font.sizeXs }}>{unassignedCount > 0 ? t('panel.unassignedShort', { count: unassignedCount }) : ''}</span>
      </div>
      {technicians.filter((u) => u.isActive).map((tech) => {
        const active = selectedId === tech.id;
        return (
          <div
            key={tech.id}
            onClick={() => onSelect(active ? undefined : tech.id)}
            onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOver(tech.id); }}
            onDragLeave={() => setDragOver(null)}
            onDrop={(e) => drop(e, tech)}
            style={rowStyle(active, dragOver === tech.id)}
          >
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tech.firstName} {tech.lastName}</span>
            <span style={{ minWidth: 22, textAlign: 'center', borderRadius: theme.radius.full, padding: '0 6px', fontSize: theme.font.sizeXs, fontWeight: theme.font.weightSemibold, background: (counts[tech.id] ?? 0) > 0 ? theme.colors.primary : theme.colors.surfaceAlt, color: (counts[tech.id] ?? 0) > 0 ? '#fff' : theme.colors.textMuted }}>
              {counts[tech.id] ?? 0}
            </span>
          </div>
        );
      })}
      <p style={{ margin: '0.5rem 0 0', fontSize: theme.font.sizeXs, color: theme.colors.textLight }}>{t('panel.dropHint')}</p>
    </aside>
  );
}
