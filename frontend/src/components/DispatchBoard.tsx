import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { User, WorkOrder, WorkOrderStatus } from '../types';
import type { DispatchPayload } from './DispatchConfirmModal';
import WorkOrderStatusBadge from './WorkOrderStatusBadge';
import { theme } from '../theme';
import { formatStreet } from '../utils/addressFormat';

export type DispatchSort = 'time' | 'priority' | 'type' | 'reference';

interface Props {
  workOrders: WorkOrder[];
  technicians: User[];
  sort: DispatchSort;
  onOpen: (workOrderId: string) => void;
  onAssign: (payload: DispatchPayload) => void;
  onUnassign: (workOrder: WorkOrder) => void;
}

function sortRows(rows: WorkOrder[], sort: DispatchSort): WorkOrder[] {
  const copy = [...rows];
  switch (sort) {
    case 'priority':
      return copy.sort((a, b) => b.priority - a.priority || (a.scheduledStartTime ?? a.scheduledDate ?? '').localeCompare(b.scheduledStartTime ?? b.scheduledDate ?? ''));
    case 'type':
      return copy.sort((a, b) => (a.taskType?.name ?? a.type).localeCompare(b.taskType?.name ?? b.type) || a.referenceNumber.localeCompare(b.referenceNumber));
    case 'reference':
      return copy.sort((a, b) => a.referenceNumber.localeCompare(b.referenceNumber));
    default:
      return copy.sort((a, b) => (a.scheduledStartTime ?? a.scheduledDate ?? '9').localeCompare(b.scheduledStartTime ?? b.scheduledDate ?? '9'));
  }
}

/**
 * Dispatch mode (kanban) : one column per active technician plus « Non assigné ».
 * Cards are draggable between columns ; dropping on a technician opens the
 * assign-and-dispatch confirmation, dropping on « Non assigné » unassigns.
 */
export default function DispatchBoard({ workOrders, technicians, sort, onOpen, onAssign, onUnassign }: Props) {
  const { t, i18n } = useTranslation('workOrders');
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const locale = i18n.language.startsWith('en') ? 'en-CA' : 'fr-CA';

  const columns = useMemo(() => {
    const byTech = new Map<string, WorkOrder[]>();
    const unassigned: WorkOrder[] = [];
    for (const wo of workOrders) {
      if (wo.assignedToId) {
        const arr = byTech.get(wo.assignedToId) ?? [];
        arr.push(wo);
        byTech.set(wo.assignedToId, arr);
      } else {
        unassigned.push(wo);
      }
    }
    return { unassigned: sortRows(unassigned, sort), byTech };
  }, [workOrders, sort]);

  function dragStart(e: React.DragEvent, wo: WorkOrder) {
    e.dataTransfer.setData('workOrderId', wo.id);
    e.dataTransfer.setData('workOrderTitle', wo.title);
    e.dataTransfer.setData('workOrderStatus', wo.status);
    e.dataTransfer.effectAllowed = 'move';
    setDraggingId(wo.id);
  }

  function dropOn(e: React.DragEvent, tech: User | null) {
    e.preventDefault();
    setDragOver(null);
    const workOrderId = e.dataTransfer.getData('workOrderId');
    const wo = workOrders.find((w) => w.id === workOrderId);
    if (!wo) return;
    if (!tech) {
      if (wo.assignedToId) onUnassign(wo);
      return;
    }
    if (wo.assignedToId === tech.id) return;
    onAssign({
      workOrderId: wo.id,
      workOrderTitle: wo.title,
      technicianId: tech.id,
      technicianName: `${tech.firstName} ${tech.lastName}`,
      workOrderStatus: (e.dataTransfer.getData('workOrderStatus') as WorkOrderStatus) || undefined,
    });
  }

  const renderCard = (wo: WorkOrder) => {
    const client = wo.client ? (wo.client.companyName || `${wo.client.firstName} ${wo.client.lastName}`) : wo.externalClientName ?? (wo.temporaryClient ? `${wo.temporaryClient.firstName} ${wo.temporaryClient.lastName}` : '');
    const addr = wo.clientAddress_rel ? formatStreet(wo.clientAddress_rel) : wo.clientAddress ?? '';
    const when = wo.scheduledStartTime
      ? new Date(wo.scheduledStartTime).toLocaleString(locale, { weekday: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
      : wo.scheduledDate
        ? new Date(wo.scheduledDate).toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' })
        : t('dispatch.unscheduled');
    return (
      <div
        key={wo.id}
        draggable
        onDragStart={(e) => dragStart(e, wo)}
        onDragEnd={() => setDraggingId(null)}
        style={{
          background: theme.colors.surface, border: theme.borders.default, borderLeft: `4px solid ${wo.currentStep?.color ?? theme.colors.border}`,
          borderRadius: theme.radius.md, padding: '0.5rem 0.6rem', display: 'flex', flexDirection: 'column', gap: 3,
          cursor: draggingId === wo.id ? 'grabbing' : 'grab', opacity: draggingId === wo.id ? 0.6 : 1, boxShadow: theme.shadows.sm,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
          <button onClick={() => onOpen(wo.id)} style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', fontFamily: 'monospace', fontSize: theme.font.sizeXs, color: theme.colors.primary, fontWeight: theme.font.weightSemibold }}>
            {wo.referenceNumber}
          </button>
          {wo.priority > 0 && <span title={t('fields.priority')} style={{ fontSize: theme.font.sizeXs, color: wo.priority >= 3 ? theme.colors.danger : theme.colors.warning }}>{'!'.repeat(Math.min(wo.priority, 3))}</span>}
        </div>
        <div style={{ fontSize: theme.font.sizeSm, fontWeight: theme.font.weightMedium, color: theme.colors.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={wo.title}>{wo.title}</div>
        {(client || addr) && <div style={{ fontSize: theme.font.sizeXs, color: theme.colors.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{[client, addr].filter(Boolean).join(' · ')}</div>}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: theme.font.sizeXs, color: theme.colors.textSecondary }}>🕒 {when}</span>
          <WorkOrderStatusBadge step={wo.currentStep} status={wo.status} size="sm" />
        </div>
      </div>
    );
  };

  const column = (key: string, title: string, rows: WorkOrder[], tech: User | null) => (
    <div
      key={key}
      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOver(key); }}
      onDragLeave={() => setDragOver(null)}
      onDrop={(e) => dropOn(e, tech)}
      style={{
        minWidth: 240, width: 240, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '0.4rem',
        background: dragOver === key ? theme.colors.successLight : theme.colors.surfaceAlt, border: dragOver === key ? `2px dashed ${theme.colors.success}` : theme.borders.default,
        borderRadius: theme.radius.lg, padding: '0.6rem', maxHeight: 'calc(100vh - 260px)', overflowY: 'auto',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 0.2rem 0.3rem' }}>
        <span style={{ fontWeight: theme.font.weightSemibold, fontSize: theme.font.sizeSm, color: tech ? theme.colors.text : theme.colors.textSecondary }}>{tech ? '👷 ' : '📥 '}{title}</span>
        <span style={{ fontSize: theme.font.sizeXs, color: theme.colors.textMuted }}>{rows.length}</span>
      </div>
      {rows.length === 0 && <div style={{ fontSize: theme.font.sizeXs, color: theme.colors.textLight, padding: '0.5rem', textAlign: 'center', border: `1px dashed ${theme.colors.borderLight}`, borderRadius: theme.radius.md }}>{t('dispatch.empty')}</div>}
      {rows.map(renderCard)}
    </div>
  );

  return (
    <div style={{ display: 'flex', gap: '0.75rem', overflowX: 'auto', paddingBottom: '0.5rem', alignItems: 'flex-start' }}>
      {column('unassigned', t('dispatch.unassigned'), columns.unassigned, null)}
      {technicians.filter((u) => u.isActive).map((tech) => column(tech.id, `${tech.firstName} ${tech.lastName}`, sortRows(columns.byTech.get(tech.id) ?? [], sort), tech))}
    </div>
  );
}
