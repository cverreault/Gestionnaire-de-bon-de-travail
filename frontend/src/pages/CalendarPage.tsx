import { useState, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate as useRouterNavigate } from 'react-router-dom';
import {
  format,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  startOfDay,
  endOfDay,
  eachDayOfInterval,
  addDays,
  addWeeks,
  addMonths,
  subDays,
  subWeeks,
  subMonths,
  isSameDay,
  isSameMonth,
  getHours,
  getMinutes,
  differenceInMinutes,
} from 'date-fns';
import { fr } from 'date-fns/locale';
import { useTranslation } from 'react-i18next';
import { currentDateFnsLocale } from '../utils/dateFormat';
import { useAuthStore } from '../context/auth.store';
import api from '../services/api';
import workOrdersService from '../services/work-orders.service';
import type { CreateWorkOrderDto, UpdateWorkOrderDto } from '../services/work-orders.service';
import LoadingSpinner from '../components/LoadingSpinner';
import type { CalendarEvent, ApiResponse, User } from '../types';
import { Role, WorkOrderType } from '../types';
import { theme, cardStyles, formStyles, modalStyles, layoutStyles } from '../theme';
import { useBreakpoint } from '../hooks/useBreakpoint';

// ─── Types ────────────────────────────────────────────────────────────────────

type CalendarView = 'day' | '3days' | 'week' | 'month';

interface QuickCreateInitial {
  day: Date;
  startHour: number;
  startMin: number;
  technicianId?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TIMELINE_START = 7;   // 7:00
const TIMELINE_END   = 19;  // 19:00
const HOUR_HEIGHT    = 60;  // px per hour
const TOTAL_HEIGHT   = (TIMELINE_END - TIMELINE_START) * HOUR_HEIGHT; // 720px

const TIMELINE_HOURS = Array.from(
  { length: TIMELINE_END - TIMELINE_START + 1 },
  (_, i) => i + TIMELINE_START,
); // [7, 8, ..., 19]

const DAY_NAMES  = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
const MONTH_NAMES = ['jan', 'fév', 'mar', 'avr', 'mai', 'juin', 'jul', 'aoû', 'sep', 'oct', 'nov', 'déc'];

const WEEK_DAYS_FR = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

const WORK_ORDER_TYPE_FR: Record<string, string> = {
  [WorkOrderType.INSTALLATION]: 'Installation',
  [WorkOrderType.REPAIR]:       'Réparation',
  [WorkOrderType.MAINTENANCE]:  'Maintenance',
  [WorkOrderType.INSPECTION]:   'Inspection',
  [WorkOrderType.OTHER]:        'Autre',
};

const PRIORITY_OPTIONS = [
  { value: 1, label: 'Très basse' },
  { value: 2, label: 'Basse' },
  { value: 3, label: 'Normale' },
  { value: 4, label: 'Haute' },
  { value: 5, label: 'Critique' },
];

// ─── Status colors ────────────────────────────────────────────────────────────

const STATUS_COLOR: Record<string, string> = {
  CREATED: '#3b82f6',
  ASSIGNED: '#f59e0b',
  DISPATCHED: '#6366f1',
  IN_PROGRESS: '#f97316',
  COMPLETED_POSITIVE: '#10b981',
  COMPLETED_NEGATIVE: '#ef4444',
};

function eventColor(ev: CalendarEvent): string {
  if (ev.color) return ev.color;
  if (ev.status && STATUS_COLOR[ev.status]) return STATUS_COLOR[ev.status];
  if (ev.type === 'appointment') return '#8b5cf6';
  return '#3b82f6';
}

// ─── Time helpers ─────────────────────────────────────────────────────────────

/** Convert a Y offset (px inside the event area) to { hours, mins } rounded to 30min. */
function calcTimeFromY(offsetY: number): { hours: number; mins: number } {
  const totalMinutes = (Math.max(0, offsetY) / HOUR_HEIGHT) * 60;
  const clamped = Math.min(totalMinutes, (TIMELINE_END - TIMELINE_START) * 60 - 30);
  const rounded = Math.round(clamped / 30) * 30;
  const hours = TIMELINE_START + Math.floor(rounded / 60);
  const mins  = rounded % 60;
  return { hours, mins };
}

function fmtTime(h: number, m: number): string {
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// ─── Overlap column assignment ────────────────────────────────────────────────

interface PositionedEvent {
  event: CalendarEvent;
  col: number;
  cols: number;
}

function assignColumns(events: CalendarEvent[]): PositionedEvent[] {
  const sorted = [...events].sort(
    (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
  );

  const columns: CalendarEvent[][] = [];

  for (const ev of sorted) {
    let placed = false;
    for (let c = 0; c < columns.length; c++) {
      const last = columns[c][columns[c].length - 1];
      if (new Date(last.endTime) <= new Date(ev.startTime)) {
        columns[c].push(ev);
        placed = true;
        break;
      }
    }
    if (!placed) columns.push([ev]);
  }

  const result: PositionedEvent[] = [];
  for (let c = 0; c < columns.length; c++) {
    for (const ev of columns[c]) {
      result.push({ event: ev, col: c, cols: columns.length });
    }
  }
  return result;
}

// ─── Event positioning helpers ────────────────────────────────────────────────

function getEventTop(ev: CalendarEvent): number {
  const start = new Date(ev.startTime);
  const minutes = (getHours(start) - TIMELINE_START) * 60 + getMinutes(start);
  return Math.max(0, minutes);
}

function getEventHeight(ev: CalendarEvent): number {
  const start = new Date(ev.startTime);
  const end   = new Date(ev.endTime);
  const duration = differenceInMinutes(end, start);
  const startMin = (getHours(start) - TIMELINE_START) * 60 + getMinutes(start);
  const endMin   = startMin + duration;
  const clampedEnd = Math.min(endMin, TOTAL_HEIGHT);
  return Math.max(20, clampedEnd - Math.max(0, startMin));
}

// ─── Quick-create modal ───────────────────────────────────────────────────────

function QuickCreateModal({
  initial,
  technicians,
  isSaving,
  onClose,
  onSave,
}: {
  initial: QuickCreateInitial;
  technicians?: User[];
  isSaving: boolean;
  onClose: () => void;
  onSave: (dto: CreateWorkOrderDto) => void;
}) {
  const { day, startHour, startMin, technicianId: initTechId } = initial;

  const defaultEndH = startMin + 60 >= 60 ? startHour + 1 : startHour;
  const defaultEndM = (startMin + 60) % 60;

  const [title, setTitle]           = useState('');
  const [type, setType]             = useState<string>(WorkOrderType.REPAIR);
  const [priority, setPriority]     = useState<number>(3);
  const [description, setDesc]      = useState('');
  const [technicianId, setTechId]   = useState(initTechId ?? '');
  const [scheduledDate, setDate]    = useState(format(day, 'yyyy-MM-dd'));
  const [startTime, setStart]       = useState(fmtTime(startHour, startMin));
  const [endTime, setEnd]           = useState(fmtTime(defaultEndH, defaultEndM));
  const [titleError, setTitleError] = useState('');

  const doSubmit = () => {
    if (!title.trim()) {
      setTitleError('Le titre est requis');
      return;
    }
    onSave({
      title:               title.trim(),
      type,
      priority,
      description:         description.trim() || undefined,
      assignedToId:        technicianId || undefined,
      scheduledDate,
      scheduledStartTime:  startTime,
      scheduledEndTime:    endTime,
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    doSubmit();
  };

  return (
    <div
      style={{ ...modalStyles.overlay }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        style={{
          ...modalStyles.content,
          maxWidth: '520px',
          borderTop: `4px solid ${theme.colors.primary}`,
        }}
      >
        {/* Header */}
        <div style={{ ...modalStyles.header }}>
          <h3 style={{ ...modalStyles.headerTitle }}>Nouveau bon de travail</h3>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: '1.1rem',
              color: theme.colors.textLight,
              lineHeight: 1,
            }}
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} style={{ ...modalStyles.body }}>
          {/* Title */}
          <div style={{ ...formStyles.fieldGroup }}>
            <label style={{ ...formStyles.labelRequired }}>
              Titre <span style={{ color: theme.colors.danger }}>*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => { setTitle(e.target.value); setTitleError(''); }}
              placeholder="Ex : Réparation chaudière"
              autoFocus
              style={{ ...formStyles.input }}
            />
            {titleError && (
              <span style={{ ...formStyles.fieldError }}>{titleError}</span>
            )}
          </div>

          {/* Type + Priority */}
          <div style={{ ...formStyles.fieldGrid2, marginBottom: '1rem' }}>
            <div>
              <label style={{ ...formStyles.label }}>Type</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                style={{ ...formStyles.select }}
              >
                {Object.values(WorkOrderType).map((t) => (
                  <option key={t} value={t}>
                    {WORK_ORDER_TYPE_FR[t] ?? t}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ ...formStyles.label }}>Priorité</label>
              <select
                value={priority}
                onChange={(e) => setPriority(Number(e.target.value))}
                style={{ ...formStyles.select }}
              >
                {PRIORITY_OPTIONS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Technician */}
          {technicians && technicians.length > 0 && (
            <div style={{ ...formStyles.fieldGroup }}>
              <label style={{ ...formStyles.label }}>Technicien</label>
              <select
                value={technicianId}
                onChange={(e) => setTechId(e.target.value)}
                style={{ ...formStyles.select }}
              >
                <option value="">— Aucun —</option>
                {technicians.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.firstName} {t.lastName}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Date */}
          <div style={{ ...formStyles.fieldGroup }}>
            <label style={{ ...formStyles.label }}>Date planifiée</label>
            <input
              type="date"
              value={scheduledDate}
              onChange={(e) => setDate(e.target.value)}
              style={{ ...formStyles.input }}
            />
          </div>

          {/* Start + End time */}
          <div style={{ ...formStyles.fieldGrid2, marginBottom: '1rem' }}>
            <div>
              <label style={{ ...formStyles.label }}>Heure de début</label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStart(e.target.value)}
                style={{ ...formStyles.input }}
              />
            </div>
            <div>
              <label style={{ ...formStyles.label }}>Heure de fin</label>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEnd(e.target.value)}
                style={{ ...formStyles.input }}
              />
            </div>
          </div>

          {/* Description */}
          <div style={{ ...formStyles.fieldGroup }}>
            <label style={{ ...formStyles.label }}>Description</label>
            <textarea
              value={description}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="Détails supplémentaires…"
              rows={3}
              style={{ ...formStyles.textarea }}
            />
          </div>
        </form>

        {/* Footer */}
        <div style={{ ...modalStyles.footer }}>
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            style={{
              padding: '0.45rem 1.1rem',
              background: theme.colors.surface,
              border: theme.borders.default,
              borderRadius: theme.radius.md,
              cursor: 'pointer',
              fontSize: theme.font.sizeSm,
              color: theme.colors.text,
              opacity: isSaving ? 0.6 : 1,
            }}
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={doSubmit}
            disabled={isSaving}
            style={{
              padding: '0.45rem 1.25rem',
              background: isSaving ? theme.colors.textLight : theme.colors.primary,
              border: 'none',
              borderRadius: theme.radius.md,
              cursor: isSaving ? 'not-allowed' : 'pointer',
              fontSize: theme.font.sizeSm,
              fontWeight: theme.font.weightSemibold,
              color: '#fff',
            }}
          >
            {isSaving ? 'Enregistrement…' : 'Créer le BT'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Timeline column for a single day ────────────────────────────────────────

function TimelineDay({
  day,
  events,
  onEventClick,
  showDateHeader = true,
  isToday = false,
  isAdmin = false,
  isDragActive = false,
  onEmptyClick,
  onEventDrop,
  onHover,
}: {
  day: Date;
  events: CalendarEvent[];
  onEventClick: (ev: CalendarEvent) => void;
  showDateHeader?: boolean;
  isToday?: boolean;
  isAdmin?: boolean;
  isDragActive?: boolean;
  onEmptyClick?: (day: Date, offsetY: number) => void;
  onEventDrop?: (event: CalendarEvent, day: Date, offsetY: number) => void;
  onHover?: (info: { x: number; y: number; day: Date; hours: number; mins: number } | null) => void;
}) {
  const [isDragOver, setIsDragOver] = useState(false);

  const positioned = assignColumns(
    events.filter((ev) => {
      const start = new Date(ev.startTime);
      return getHours(start) >= TIMELINE_START && getHours(start) < TIMELINE_END;
    }),
  );

  // ── Click on empty area ────────────────────────────────────────────────────
  const handleAreaClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!isAdmin || !onEmptyClick) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const offsetY = e.clientY - rect.top;
      onEmptyClick(day, offsetY);
    },
    [isAdmin, onEmptyClick, day],
  );

  // ── Drag over / leave / drop ───────────────────────────────────────────────
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    if (!isAdmin) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    // Only clear when leaving the container itself (not child elements)
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    if (!isAdmin || !onEventDrop) return;
    const raw = e.dataTransfer.getData('application/calendar-event');
    if (!raw) return;
    try {
      const ev: CalendarEvent = JSON.parse(raw);
      const rect = e.currentTarget.getBoundingClientRect();
      const offsetY = e.clientY - rect.top;
      onEventDrop(ev, day, offsetY);
    } catch {
      // Ignore malformed drag data
    }
  };

  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      {showDateHeader && (
        <div
          style={{
            textAlign: 'center',
            padding: '0.4rem 0',
            fontSize: theme.font.sizeXs,
            fontWeight: isToday ? theme.font.weightBold : theme.font.weightMedium,
            color: isToday ? theme.colors.primary : theme.colors.text,
            borderBottom: theme.borders.default,
            background: isToday ? theme.colors.primaryLight : theme.colors.surface,
          }}
        >
          <div style={{ fontSize: '0.7rem', color: theme.colors.textLight, fontWeight: theme.font.weightNormal }}>
            {format(day, 'EEE', { locale: currentDateFnsLocale() })}
          </div>
          <div>{format(day, 'd MMM', { locale: currentDateFnsLocale() })}</div>
        </div>
      )}

      {/* Event area */}
      <div
        onClick={handleAreaClick}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onMouseMove={(e) => {
          if (!onHover || isDragActive) return;
          const rect = e.currentTarget.getBoundingClientRect();
          const offsetY = e.clientY - rect.top;
          const { hours, mins } = calcTimeFromY(offsetY);
          onHover({ x: e.clientX, y: e.clientY, day, hours, mins });
        }}
        onMouseLeave={() => { if (onHover) onHover(null); }}
        style={{
          position: 'relative',
          height: TOTAL_HEIGHT + 'px',
          borderLeft: theme.borders.default,
          cursor: isAdmin ? 'crosshair' : 'default',
          background: isDragOver
            ? `${theme.colors.primaryLight}`
            : 'transparent',
          transition: 'background 0.1s ease',
        }}
      >
        {/* Hour grid lines */}
        {TIMELINE_HOURS.map((h) => (
          <div
            key={h}
            style={{
              position: 'absolute',
              top: (h - TIMELINE_START) * HOUR_HEIGHT + 'px',
              left: 0,
              right: 0,
              borderTop: theme.borders.light,
              pointerEvents: 'none',
            }}
          />
        ))}

        {/* Drop zone indicator lines (visible during any drag) */}
        {isDragActive && TIMELINE_HOURS.map((h) => (
          <div
            key={`drop-${h}`}
            style={{
              position: 'absolute',
              top: (h - TIMELINE_START) * HOUR_HEIGHT + 'px',
              left: 0,
              right: 0,
              height: '3px',
              background: isDragOver ? theme.colors.primary : `${theme.colors.primary}30`,
              pointerEvents: 'none',
              zIndex: 2,
              borderRadius: '1px',
            }}
          />
        ))}

        {/* Half-hour drop lines */}
        {isDragActive && TIMELINE_HOURS.slice(0, -1).map((h) => (
          <div
            key={`drop-half-${h}`}
            style={{
              position: 'absolute',
              top: (h - TIMELINE_START) * HOUR_HEIGHT + 30 + 'px',
              left: 0,
              right: 0,
              height: '2px',
              background: isDragOver ? `${theme.colors.primary}80` : `${theme.colors.primary}18`,
              pointerEvents: 'none',
              zIndex: 2,
              borderRadius: '1px',
            }}
          />
        ))}

        {/* "+" click hint when admin hovers the empty area */}
        {isAdmin && !isDragActive && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'flex-end',
              padding: '4px 6px',
              pointerEvents: 'none',
              opacity: 0,
            }}
          />
        )}

        {/* Events */}
        {positioned.map(({ event: ev, col, cols }) => {
          const top    = getEventTop(ev);
          const height = getEventHeight(ev);
          const color  = eventColor(ev);
          const width  = `${Math.floor(100 / cols)}%`;
          const left   = `${Math.floor((col / cols) * 100)}%`;
          const isDraggable = isAdmin && ev.type === 'work_order';

          return (
            <div
              key={ev.id}
              draggable={isDraggable}
              onClick={(e) => { e.stopPropagation(); onEventClick(ev); }}
              onDragStart={(e) => {
                e.stopPropagation();
                e.dataTransfer.setData('application/calendar-event', JSON.stringify(ev));
                e.dataTransfer.effectAllowed = 'move';
              }}
              title={ev.title}
              style={{
                position: 'absolute',
                top: top + 'px',
                height: height + 'px',
                left,
                width,
                background: color + 'e6',
                borderLeft: `3px solid ${color}`,
                borderRadius: '3px',
                padding: '2px 4px',
                overflow: 'hidden',
                cursor: isDraggable ? 'grab' : 'pointer',
                boxSizing: 'border-box',
                zIndex: 1,
                userSelect: 'none',
              }}
            >
              <div
                style={{
                  fontSize: '0.68rem',
                  fontWeight: theme.font.weightSemibold,
                  color: '#fff',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {format(new Date(ev.startTime), 'HH:mm')} {ev.title}
              </div>
              {height > 30 && ev.technicianName && (
                <div style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.85)', marginTop: '1px' }}>
                  👤 {ev.technicianName}
                </div>
              )}
              {isDraggable && height > 40 && (
                <div style={{ fontSize: '0.55rem', color: 'rgba(255,255,255,0.6)', marginTop: '2px' }}>
                  ⠿ glisser pour déplacer
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Timeline wrapper (shared by day / 3days / week) ─────────────────────────

function TimelineView({
  days,
  events,
  onEventClick,
  isAdmin = false,
  isDragActive = false,
  onEmptyClick,
  onEventDrop,
  onHover,
}: {
  days: Date[];
  events: CalendarEvent[];
  onEventClick: (ev: CalendarEvent) => void;
  isAdmin?: boolean;
  isDragActive?: boolean;
  onEmptyClick?: (day: Date, offsetY: number) => void;
  onEventDrop?: (event: CalendarEvent, day: Date, offsetY: number) => void;
  onHover?: (info: { x: number; y: number; day: Date; hours: number; mins: number } | null) => void;
}) {
  const today = new Date();

  const eventsForDay = (day: Date) =>
    events.filter((ev) => isSameDay(new Date(ev.startTime), day));

  return (
    <div style={{ ...cardStyles.card }}>
      <div style={{ display: 'flex', overflowX: 'auto' }}>
        {/* Hour labels column */}
        <div style={{ width: '48px', flexShrink: 0 }}>
          {/* Spacer for header row */}
          <div style={{ height: '49px', borderBottom: theme.borders.default }} />
          {/* Hour labels */}
          <div style={{ position: 'relative', height: TOTAL_HEIGHT + 'px' }}>
            {TIMELINE_HOURS.map((h) => (
              <div
                key={h}
                style={{
                  position: 'absolute',
                  top: (h - TIMELINE_START) * HOUR_HEIGHT - 8 + 'px',
                  right: '6px',
                  fontSize: '0.65rem',
                  color: theme.colors.textLight,
                  userSelect: 'none',
                }}
              >
                {h}h
              </div>
            ))}
          </div>
        </div>

        {/* Day columns */}
        {days.map((day) => (
          <TimelineDay
            key={day.toISOString()}
            day={day}
            events={eventsForDay(day)}
            onEventClick={onEventClick}
            isToday={isSameDay(day, today)}
            isAdmin={isAdmin}
            isDragActive={isDragActive}
            onEmptyClick={onEmptyClick}
            onEventDrop={onEventDrop}
            onHover={onHover}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Month view ───────────────────────────────────────────────────────────────

function MonthView({
  currentDate,
  events,
  selectedDay,
  onSelectDay,
  onEventClick,
  isAdmin = false,
  onCreateOnDay,
  onHover,
}: {
  currentDate: Date;
  events: CalendarEvent[];
  selectedDay: Date | null;
  onSelectDay: (d: Date) => void;
  onEventClick: (ev: CalendarEvent) => void;
  isAdmin?: boolean;
  onCreateOnDay?: (day: Date) => void;
  onHover?: (info: { x: number; y: number; label: string } | null) => void;
}) {
  const monthStart = startOfMonth(currentDate);
  const monthEnd   = endOfMonth(currentDate);
  const today      = new Date();

  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const gridEnd   = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const allDays   = eachDayOfInterval({ start: gridStart, end: gridEnd });

  const eventsForDay = (day: Date) =>
    events.filter((ev) => isSameDay(new Date(ev.startTime), day));

  return (
    // B20 — sur téléphone la grille 7 colonnes garde une largeur minimale
    // et scrolle horizontalement dans sa carte plutôt que de s'écraser.
    <div style={{ ...cardStyles.card, padding: '1rem', overflowX: 'auto' }}>
      <div style={{ minWidth: 640 }}>
      {/* Day headers */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          gap: '2px',
          marginBottom: '4px',
        }}
      >
        {WEEK_DAYS_FR.map((d) => (
          <div
            key={d}
            style={{
              textAlign: 'center',
              fontSize: '0.72rem',
              fontWeight: theme.font.weightSemibold,
              color: theme.colors.textLight,
              padding: '0.25rem 0',
            }}
          >
            {d}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px' }}>
        {allDays.map((day) => {
          const dayEvents  = eventsForDay(day);
          const isSelected = selectedDay ? isSameDay(day, selectedDay) : false;
          const isToday    = isSameDay(day, today);
          const isCurrentM = isSameMonth(day, currentDate);

          return (
            <div
              key={day.toISOString()}
              onClick={() => onSelectDay(day)}
              onMouseEnter={(e) => {
                if (!onHover) return;
                const label = `${DAY_NAMES[day.getDay()]} ${day.getDate()} ${MONTH_NAMES[day.getMonth()]} ${day.getFullYear()}`;
                onHover({ x: e.clientX, y: e.clientY, label });
              }}
              onMouseLeave={() => { if (onHover) onHover(null); }}
              style={{
                minHeight: '64px',
                padding: '4px',
                borderRadius: theme.radius.sm,
                background: isSelected
                  ? theme.colors.primaryLight
                  : isToday
                  ? theme.colors.warningLight
                  : theme.colors.surfaceAlt,
                border: `1px solid ${isSelected ? theme.colors.primary : theme.colors.borderLight}`,
                cursor: 'pointer',
                opacity: isCurrentM ? 1 : 0.45,
                position: 'relative',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '2px',
                }}
              >
                <span
                  style={{
                    fontSize: '0.78rem',
                    fontWeight: isToday ? theme.font.weightBold : theme.font.weightNormal,
                    color: isToday ? theme.colors.primary : theme.colors.text,
                  }}
                >
                  {format(day, 'd')}
                </span>

                {/* Admin "+" button */}
                {isAdmin && onCreateOnDay && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onCreateOnDay(day);
                    }}
                    title="Créer un BT ce jour"
                    style={{
                      width: '16px',
                      height: '16px',
                      padding: 0,
                      background: theme.colors.primary,
                      border: 'none',
                      borderRadius: theme.radius.full,
                      cursor: 'pointer',
                      color: '#fff',
                      fontSize: '0.7rem',
                      lineHeight: '16px',
                      textAlign: 'center',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    +
                  </button>
                )}
              </div>

              {dayEvents.slice(0, 2).map((ev) => (
                <div
                  key={ev.id}
                  onClick={(e) => { e.stopPropagation(); onEventClick(ev); }}
                  style={{
                    fontSize: '0.62rem',
                    background: eventColor(ev),
                    color: '#fff',
                    borderRadius: '2px',
                    padding: '1px 3px',
                    marginBottom: '1px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    cursor: 'pointer',
                  }}
                >
                  {ev.title}
                </div>
              ))}
              {dayEvents.length > 2 && (
                <div style={{ fontSize: '0.6rem', color: theme.colors.textMuted }}>
                  +{dayEvents.length - 2}
                </div>
              )}
            </div>
          );
        })}
      </div>
      </div>
    </div>
  );
}

// ─── Detail panel (month view sidebar / any view) ─────────────────────────────

function EventDetailPanel({
  selectedDay,
  events,
}: {
  selectedDay: Date | null;
  events: CalendarEvent[];
}) {
  const dayEvents = selectedDay
    ? events.filter((ev) => isSameDay(new Date(ev.startTime), selectedDay))
    : [];

  return (
    <div style={{ ...cardStyles.card, padding: '1.25rem', height: 'fit-content', minHeight: '200px' }}>
      {selectedDay ? (
        <>
          <h3 style={{ margin: '0 0 1rem', color: theme.colors.text, fontSize: '0.95rem' }}>
            {format(selectedDay, 'EEEE d MMMM', { locale: currentDateFnsLocale() })}
          </h3>
          {dayEvents.length === 0 ? (
            <p style={{ color: theme.colors.textLight, fontSize: theme.font.sizeSm, margin: 0 }}>
              Aucun événement ce jour
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              {dayEvents.map((ev) => (
                <div
                  key={ev.id}
                  style={{
                    padding: '0.65rem 0.75rem',
                    background: theme.colors.surfaceAlt,
                    borderRadius: theme.radius.md,
                    border: theme.borders.light,
                    borderLeft: `3px solid ${eventColor(ev)}`,
                  }}
                >
                  <p style={{ margin: '0 0 0.2rem', fontWeight: theme.font.weightSemibold, fontSize: '0.85rem', color: theme.colors.text }}>
                    {ev.title}
                  </p>
                  <p style={{ margin: 0, fontSize: '0.75rem', color: theme.colors.textSecondary }}>
                    {format(new Date(ev.startTime), 'HH:mm')}
                    {' – '}
                    {format(new Date(ev.endTime), 'HH:mm')}
                  </p>
                  {ev.technicianName && (
                    <p style={{ margin: '0.2rem 0 0', fontSize: '0.72rem', color: theme.colors.textLight }}>
                      👤 {ev.technicianName}
                    </p>
                  )}
                  {ev.workOrderId && (
                    <Link
                      to={`/bons-de-travail/${ev.workOrderId}`}
                      style={{ display: 'inline-block', marginTop: '0.3rem', fontSize: '0.7rem', color: theme.colors.info, textDecoration: 'none' }}
                    >
                      Voir le BT →
                    </Link>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <p style={{ color: theme.colors.textLight, fontSize: theme.font.sizeSm, margin: 0 }}>
          Sélectionnez un jour pour voir les événements
        </p>
      )}
    </div>
  );
}

// ─── Clicked event detail modal ───────────────────────────────────────────────

function EventModal({ event, onClose }: { event: CalendarEvent; onClose: () => void }) {
  const color = eventColor(event);
  return (
    <div
      style={{ ...modalStyles.overlay }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        style={{
          ...modalStyles.content,
          maxWidth: '400px',
          borderTop: `4px solid ${color}`,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '1rem 1.5rem', borderBottom: theme.borders.default }}>
          <h3 style={{ margin: 0, color: theme.colors.text, fontSize: theme.font.sizeMd }}>{event.title}</h3>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.1rem', color: theme.colors.textLight }}
          >
            ✕
          </button>
        </div>

        <div style={{ padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.85rem', color: theme.colors.text }}>
          <div>
            🕐{' '}
            <strong>
              {format(new Date(event.startTime), 'EEEE d MMMM, HH:mm', { locale: currentDateFnsLocale() })}
            </strong>
            {' – '}
            {format(new Date(event.endTime), 'HH:mm')}
          </div>

          {event.technicianName && (
            <div>👤 <strong>{event.technicianName}</strong></div>
          )}

          {event.description && (
            <p style={{ margin: 0, color: theme.colors.textSecondary, fontSize: theme.font.sizeXs }}>{event.description}</p>
          )}

          {event.status && (
            <div>
              Statut :{' '}
              <span
                style={{
                  background: (STATUS_COLOR[event.status] ?? theme.colors.textSecondary) + '1a',
                  color: STATUS_COLOR[event.status] ?? theme.colors.textSecondary,
                  padding: '0.15rem 0.5rem',
                  borderRadius: theme.radius.full,
                  fontSize: theme.font.sizeXs,
                  fontWeight: theme.font.weightSemibold,
                }}
              >
                {event.status}
              </span>
            </div>
          )}

          {event.workOrderId && (
            <Link
              to={`/bons-de-travail/${event.workOrderId}`}
              style={{
                display: 'inline-block',
                marginTop: '0.5rem',
                padding: '0.4rem 0.875rem',
                background: theme.colors.primary,
                color: '#fff',
                borderRadius: theme.radius.sm,
                textDecoration: 'none',
                fontSize: theme.font.sizeXs,
                fontWeight: theme.font.weightSemibold,
              }}
            >
              Voir le bon de travail
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main CalendarPage ────────────────────────────────────────────────────────

export default function CalendarPage() {
  const { t: tNav } = useTranslation('nav');
  const { user } = useAuthStore();
  const { isDesktop } = useBreakpoint();
  const isAdmin = user?.role === Role.ADMIN;
  const queryClient = useQueryClient();

  const routerNavigate = useRouterNavigate();
  const [view, setView]                         = useState<CalendarView>('week');
  const [currentDate, setCurrentDate]           = useState(new Date());
  const [selectedDay, setSelectedDay]           = useState<Date | null>(null);
  const [selectedTechnicianId, setTechnicianId] = useState<string>('');
  const [clickedEvent, setClickedEvent]         = useState<CalendarEvent | null>(null);
  const [isDragActive, setIsDragActive]         = useState(false);
  const [hoverInfo, setHoverInfo]               = useState<{ x: number; y: number; label: string } | null>(null);

  // ── Helper: navigate to /bons-de-travail/nouveau with prefilled query params ──
  function goToCreateBT(opts: { day: Date; startHour: number; startMin: number; technicianId?: string }) {
    const date = format(opts.day, 'yyyy-MM-dd');
    const startTime = fmtTime(opts.startHour, opts.startMin);
    const endHour = (opts.startMin + 60) >= 60 ? opts.startHour + 1 : opts.startHour;
    const endMin = (opts.startMin + 60) % 60;
    const endTime = fmtTime(endHour, endMin);
    const params = new URLSearchParams({ date, startTime, endTime });
    if (opts.technicianId) params.set('technicianId', opts.technicianId);
    routerNavigate(`/bons-de-travail/nouveau?${params.toString()}`);
  }

  // ── Date range from view + currentDate ───────────────────────────────────
  const { startDate, endDate, visibleDays, title } = useMemo(() => {
    switch (view) {
      case 'day': {
        const s = startOfDay(currentDate);
        const e = endOfDay(currentDate);
        return {
          startDate: s,
          endDate: e,
          visibleDays: [s],
          title: format(s, 'EEEE d MMMM yyyy', { locale: currentDateFnsLocale() }),
        };
      }
      case '3days': {
        const s = startOfDay(currentDate);
        const e = endOfDay(addDays(currentDate, 2));
        return {
          startDate: s,
          endDate: e,
          visibleDays: eachDayOfInterval({ start: s, end: addDays(s, 2) }),
          title:
            format(s, 'd MMM', { locale: currentDateFnsLocale() }) +
            ' – ' +
            format(addDays(s, 2), 'd MMM yyyy', { locale: currentDateFnsLocale() }),
        };
      }
      case 'week': {
        const s = startOfWeek(currentDate, { weekStartsOn: 1 });
        const e = endOfWeek(currentDate, { weekStartsOn: 1 });
        return {
          startDate: s,
          endDate: e,
          visibleDays: eachDayOfInterval({ start: s, end: e }),
          title:
            format(s, 'd MMM', { locale: currentDateFnsLocale() }) +
            ' – ' +
            format(e, 'd MMM yyyy', { locale: currentDateFnsLocale() }),
        };
      }
      case 'month':
      default: {
        const s = startOfMonth(currentDate);
        const e = endOfMonth(currentDate);
        return {
          startDate: s,
          endDate: e,
          visibleDays: [],
          title: format(currentDate, 'MMMM yyyy', { locale: currentDateFnsLocale() }),
        };
      }
    }
  }, [view, currentDate]);

  // ── Navigation ───────────────────────────────────────────────────────────
  const navigate = (dir: 1 | -1) => {
    setCurrentDate((prev) => {
      switch (view) {
        case 'day':    return dir > 0 ? addDays(prev, 1)    : subDays(prev, 1);
        case '3days':  return dir > 0 ? addDays(prev, 3)    : subDays(prev, 3);
        case 'week':   return dir > 0 ? addWeeks(prev, 1)   : subWeeks(prev, 1);
        case 'month':  return dir > 0 ? addMonths(prev, 1)  : subMonths(prev, 1);
      }
    });
  };

  const goToToday = () => setCurrentDate(new Date());

  // ── Fetch technicians (admin only) ────────────────────────────────────────
  const { data: technicians } = useQuery({
    queryKey: ['users', 'technicians'],
    queryFn: async () => {
      const { data } = await api.get<ApiResponse<User[]>>('/users/technicians');
      return data.data;
    },
    enabled: isAdmin,
  });

  // ── Fetch events ─────────────────────────────────────────────────────────
  const { data: events = [], isLoading } = useQuery({
    queryKey: [
      'calendar-events',
      startDate.toISOString(),
      endDate.toISOString(),
      selectedTechnicianId,
      view,
    ],
    queryFn: async () => {
      const { data } = await api.get<ApiResponse<{ events: CalendarEvent[]; warnings: string[] }>>('/calendar/events', {
        params: {
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
          technicianId: selectedTechnicianId || undefined,
          view,
        },
      });
      return data.data.events;
    },
    staleTime: 60_000,
  });

  // Note: the BT-creation mutation used to live here for the inline quick-create modal.
  // It has been removed because the "+ Nouveau" / empty-slot click now redirects to
  // /bons-de-travail/nouveau (full 4-step wizard) with the date/time/technician as URL params.

  // ── Update work order mutation (for drag & drop rescheduling) ─────────────
  const updateMutation = useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: UpdateWorkOrderDto }) =>
      workOrdersService.update(id, dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendar-events'] });
      queryClient.invalidateQueries({ queryKey: ['work-orders'] });
    },
  });

  // ── Click on empty timeline area → redirect to full create wizard ────────
  const handleEmptyClick = useCallback(
    (day: Date, offsetY: number) => {
      const { hours, mins } = calcTimeFromY(offsetY);
      goToCreateBT({
        day,
        startHour: hours,
        startMin:  mins,
        technicianId: selectedTechnicianId || undefined,
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedTechnicianId],
  );

  // ── Month view "+" click ──────────────────────────────────────────────────
  const handleCreateOnDay = useCallback((day: Date) => {
    goToCreateBT({
      day,
      startHour: 9,
      startMin:  0,
      technicianId: selectedTechnicianId || undefined,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTechnicianId]);

  // ── Drop event on a new time slot ─────────────────────────────────────────
  const handleEventDrop = useCallback(
    (event: CalendarEvent, newDay: Date, offsetY: number) => {
      // Only work orders can be rescheduled
      if (event.type !== 'work_order' || !event.workOrderId) return;

      const { hours, mins } = calcTimeFromY(offsetY);
      const newDateStr   = format(newDay, 'yyyy-MM-dd');
      const startTimeStr = fmtTime(hours, mins);

      // Preserve original duration
      const durationMin = differenceInMinutes(
        new Date(event.endTime),
        new Date(event.startTime),
      );
      const endTotalMins = hours * 60 + mins + durationMin;
      const endH = Math.floor(endTotalMins / 60);
      const endM = endTotalMins % 60;
      const endTimeStr = fmtTime(endH, endM);

      const dto: UpdateWorkOrderDto = {
        scheduledDate:      newDateStr,
        scheduledStartTime: startTimeStr,
        scheduledEndTime:   endTimeStr,
      };

      // Reassign to active technician filter if the event was from a different tech
      if (
        selectedTechnicianId &&
        event.technicianId !== selectedTechnicianId
      ) {
        dto.assignedToId = selectedTechnicianId;
      }

      updateMutation.mutate({ id: event.workOrderId, dto });
      setIsDragActive(false);
    },
    [selectedTechnicianId, updateMutation],
  );

  // ── Hover handler for tooltip ──────────────────────────────────────────────
  const handleCalendarHover = useCallback((info: { x: number; y: number; day?: Date; hours?: number; mins?: number; label?: string } | null) => {
    if (!info) { setHoverInfo(null); return; }
    if (info.label) { setHoverInfo({ x: info.x, y: info.y, label: info.label }); return; }
    const d = info.day!;
    const label = `${DAY_NAMES[d.getDay()]} ${d.getDate()} ${MONTH_NAMES[d.getMonth()]} — ${String(info.hours).padStart(2,'0')}:${String(info.mins).padStart(2,'0')}`;
    setHoverInfo({ x: info.x, y: info.y, label });
  }, []);

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ ...layoutStyles.page }}>
      {/* ── Header bar ──────────────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '0.75rem',
          alignItems: 'center',
          marginBottom: '1.25rem',
        }}
      >
        <h1 style={{ ...layoutStyles.pageTitle, flex: '0 0 auto' }}>
          {tNav('calendar')}
        </h1>

        {/* View selector */}
        <div
          style={{
            display: 'flex',
            gap: '2px',
            background: theme.colors.surfaceAlt,
            borderRadius: theme.radius.md,
            padding: '2px',
            border: theme.borders.default,
          }}
        >
          {(['day', '3days', 'week', 'month'] as CalendarView[]).map((v) => {
            const labels: Record<CalendarView, string> = {
              day: 'Jour',
              '3days': '3 Jours',
              week: 'Semaine',
              month: 'Mois',
            };
            const active = v === view;
            return (
              <button
                key={v}
                onClick={() => setView(v)}
                style={{
                  padding: '0.35rem 0.75rem',
                  border: 'none',
                  borderRadius: theme.radius.sm,
                  cursor: 'pointer',
                  fontSize: theme.font.sizeXs,
                  fontWeight: active ? theme.font.weightSemibold : theme.font.weightNormal,
                  background: active ? theme.colors.surface : 'transparent',
                  color: active ? theme.colors.primary : theme.colors.textMuted,
                  boxShadow: active ? theme.shadows.sm : 'none',
                  transition: 'all 0.15s',
                }}
              >
                {labels[v]}
              </button>
            );
          })}
        </div>

        {/* Navigation */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <button
            onClick={() => navigate(-1)}
            style={{
              border: theme.borders.default,
              background: theme.colors.surface,
              padding: '0.35rem 0.75rem',
              borderRadius: theme.radius.sm,
              cursor: 'pointer',
              fontSize: '1rem',
              color: theme.colors.text,
            }}
            aria-label="Précédent"
          >
            ‹
          </button>

          <button
            onClick={goToToday}
            style={{
              border: theme.borders.default,
              background: theme.colors.surface,
              padding: '0.35rem 0.65rem',
              borderRadius: theme.radius.sm,
              cursor: 'pointer',
              fontSize: theme.font.sizeXs,
              fontWeight: theme.font.weightSemibold,
              color: theme.colors.text,
            }}
          >
            Aujourd'hui
          </button>

          <button
            onClick={() => navigate(1)}
            style={{
              border: theme.borders.default,
              background: theme.colors.surface,
              padding: '0.35rem 0.75rem',
              borderRadius: theme.radius.sm,
              cursor: 'pointer',
              fontSize: '1rem',
              color: theme.colors.text,
            }}
            aria-label="Suivant"
          >
            ›
          </button>
        </div>

        {/* Period title */}
        <span
          style={{
            fontWeight: theme.font.weightSemibold,
            color: theme.colors.text,
            fontSize: '0.95rem',
            textTransform: 'capitalize',
          }}
        >
          {title}
        </span>

        {/* Admin: quick-create button */}
        {isAdmin && view !== 'month' && (
          <button
            onClick={() => {
              const now = new Date();
              const h = Math.min(Math.max(getHours(now), TIMELINE_START), TIMELINE_END - 1);
              const m = Math.round(getMinutes(now) / 30) * 30 % 60;
              goToCreateBT({
                day: startOfDay(currentDate),
                startHour: h,
                startMin:  m,
                technicianId: selectedTechnicianId || undefined,
              });
            }}
            style={{
              padding: '0.35rem 0.9rem',
              background: theme.colors.primary,
              border: 'none',
              borderRadius: theme.radius.sm,
              cursor: 'pointer',
              fontSize: theme.font.sizeXs,
              fontWeight: theme.font.weightSemibold,
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              gap: '0.3rem',
            }}
          >
            + Nouveau BT
          </button>
        )}

        {/* Technician filter (admin only) */}
        {isAdmin && technicians && technicians.length > 0 && (
          <select
            value={selectedTechnicianId}
            onChange={(e) => setTechnicianId(e.target.value)}
            style={{
              ...formStyles.select,
              marginLeft: 'auto',
              width: 'auto',
              padding: '0.35rem 0.75rem',
              fontSize: theme.font.sizeXs,
            }}
          >
            <option value="">Tous les techniciens</option>
            {technicians.map((t) => (
              <option key={t.id} value={t.id}>
                {t.firstName} {t.lastName}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* ── Drag active hint ─────────────────────────────────────────────── */}
      {isDragActive && (
        <div
          style={{
            marginBottom: '0.75rem',
            padding: '0.5rem 1rem',
            background: theme.colors.infoLight,
            border: `1px solid ${theme.colors.info}40`,
            borderRadius: theme.radius.md,
            fontSize: theme.font.sizeXs,
            color: theme.colors.info,
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          <span>⠿</span>
          <span>Déposez l'événement sur le créneau souhaité pour le replanifier.</span>
        </div>
      )}

      {/* ── Loading state ────────────────────────────────────────────────── */}
      {isLoading && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
          <LoadingSpinner />
        </div>
      )}

      {/* ── Calendar body ────────────────────────────────────────────────── */}
      {!isLoading && (
        <>
          {/* Month view */}
          {view === 'month' && (
            // B20 — sous 1024px le panneau détail passe sous la grille.
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: isDesktop ? '1fr 300px' : '1fr',
                gap: '1.25rem',
              }}
            >
              <MonthView
                currentDate={currentDate}
                events={events}
                selectedDay={selectedDay}
                onSelectDay={setSelectedDay}
                onEventClick={setClickedEvent}
                isAdmin={isAdmin}
                onCreateOnDay={handleCreateOnDay}
                onHover={handleCalendarHover}
              />
              <EventDetailPanel selectedDay={selectedDay} events={events} />
            </div>
          )}

          {/* Timeline views */}
          {view !== 'month' && (
            <div
              onDragStart={() => isAdmin && setIsDragActive(true)}
              onDragEnd={() => setIsDragActive(false)}
            >
              <TimelineView
                days={visibleDays}
                events={events}
                onEventClick={setClickedEvent}
                isAdmin={isAdmin}
                isDragActive={isDragActive}
                onEmptyClick={handleEmptyClick}
                onEventDrop={handleEventDrop}
                onHover={handleCalendarHover}
              />
            </div>
          )}

          {/* No events hint for timeline views */}
          {view !== 'month' && events.length === 0 && !isLoading && (
            <p
              style={{
                textAlign: 'center',
                color: theme.colors.textLight,
                fontSize: theme.font.sizeSm,
                marginTop: '1.5rem',
              }}
            >
              Aucun événement pour cette période
              {isAdmin && (
                <span style={{ display: 'block', marginTop: '0.4rem', fontSize: theme.font.sizeXs, color: theme.colors.textMuted }}>
                  Cliquez sur un créneau horaire pour créer un bon de travail.
                </span>
              )}
            </p>
          )}
        </>
      )}

      {/* ── Clicked event modal ──────────────────────────────────────────── */}
      {clickedEvent && (
        <EventModal event={clickedEvent} onClose={() => setClickedEvent(null)} />
      )}

      {/* Quick-create modal has been replaced with a redirect to the full create wizard */}

      {/* ── Hover tooltip ───────────────────────────────────────────────── */}
      {hoverInfo && !isDragActive && (
        <div style={{
          position: 'fixed',
          left: hoverInfo.x + 16,
          top: hoverInfo.y - 10,
          background: 'rgba(15, 23, 42, 0.9)',
          color: '#fff',
          padding: '4px 10px',
          borderRadius: '6px',
          fontSize: '12px',
          fontWeight: 500,
          pointerEvents: 'none',
          zIndex: 9999,
          whiteSpace: 'nowrap',
          boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
        }}>
          {hoverInfo.label}
        </div>
      )}
    </div>
  );
}
