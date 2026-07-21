import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { theme, cardStyles, layoutStyles, buttonStyles, formStyles } from '../theme';
import { toast } from '../context/toast.store';
import EmptyState from '../components/EmptyState';
import SkeletonList from '../components/SkeletonList';
import { useTaskTypes } from '../hooks/useSettings';
import { useV3Clients } from '../hooks/useClients';
import { useTechnicians } from '../hooks/useUsers';
import {
  createRecurring,
  deleteRecurring,
  listRecurring,
  previewRecurring,
  updateRecurring,
  type CreateRecurringInput,
  type Frequency,
  type RecurringWorkOrder,
} from '../services/recurring-work-orders.service';

/**
 * B11 — Admin / dispatcher UI for recurring work-order definitions.
 * Route: /parametres/bons-recurrents
 */
export default function RecurringPage() {
  const { t } = useTranslation('workOrders');
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<RecurringWorkOrder | null | undefined>(undefined);

  const { data: rows, isLoading } = useQuery({
    queryKey: ['recurring'],
    queryFn: listRecurring,
  });

  // Reference lookups for the table columns (template / client / tech).
  const { data: taskTypes } = useTaskTypes(true);
  const { data: technicians } = useTechnicians();
  const clientsQuery = useV3Clients({ limit: 100 });
  const clientsList = clientsQuery.data?.data ?? [];

  const taskTypeById = useMemo(
    () => new Map((taskTypes ?? []).map((tt) => [tt.id, tt] as const)),
    [taskTypes],
  );
  const clientById = useMemo(
    () =>
      new Map(
        (clientsList as Array<{ id: string; firstName?: string; lastName?: string; companyName?: string | null }>)
          .map((c) => [c.id, c] as const),
      ),
    [clientsList],
  );
  const techById = useMemo(
    () => new Map((technicians ?? []).map((item) => [item.id, item] as const)),
    [technicians],
  );

  const toggle = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      updateRecurring(id, { isActive }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['recurring'] }),
    onError: (err: Error) => toast.error(err.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteRecurring(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recurring'] });
      toast.success(t('workOrders:recurring.deleted', { defaultValue: 'Supprimé' }));
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <div style={layoutStyles.page}>
      <header
        style={{
          marginBottom: 16,
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          gap: 16,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h1 style={{ margin: 0 }}>🔁 {t('workOrders:recurring.pageTitle', { defaultValue: 'Bons de travail récurrents' })}</h1>
          <p
            style={{
              color: theme.colors.textMuted,
              margin: '4px 0 0',
              fontSize: 13,
              maxWidth: 720,
              lineHeight: 1.5,
            }}
          >
            {t('workOrders:recurring.pageSubtitle', { defaultValue: 'Chaque règle crée automatiquement un BT selon un calendrier (hebdo, mensuel, annuel…). Idéal pour les contrats d\'entretien préventif.' })}
          </p>
        </div>
        <button style={buttonStyles.primary} onClick={() => setEditing(null)}>
          ➕ {t('workOrders:recurring.new', { defaultValue: 'Nouveau' })}
        </button>
      </header>

      {isLoading && <SkeletonList rows={3} />}
      {!isLoading && (!rows || rows.length === 0) && (
        <EmptyState
          icon="🔁"
          title={t('workOrders:recurring.emptyTitle', { defaultValue: 'Aucun BT récurrent' })}
          subtitle={t('workOrders:recurring.emptySubtitle', { defaultValue: 'Créez votre première règle pour générer automatiquement des BT selon un calendrier.' })}
          actionLabel={t('workOrders:recurring.emptyAction', { defaultValue: 'Nouveau' })}
          onAction={() => setEditing(null)}
        />
      )}

      {!isLoading && rows && rows.length > 0 && (
        <div style={{ ...cardStyles.card, padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ background: theme.colors.surfaceAlt, fontSize: 12 }}>
              <tr>
                <th style={cellHead}>{t('workOrders:recurring.colName', { defaultValue: 'Nom' })}</th>
                <th style={cellHead}>{t('workOrders:recurring.colTypeTemplate', { defaultValue: 'Type / Modèle' })}</th>
                <th style={cellHead}>{t('workOrders:recurring.colClient', { defaultValue: 'Client' })}</th>
                <th style={cellHead}>{t('workOrders:recurring.colTechnician', { defaultValue: 'Technicien' })}</th>
                <th style={cellHead}>{t('workOrders:recurring.colFrequency', { defaultValue: 'Fréquence' })}</th>
                <th style={cellHead}>{t('workOrders:recurring.colNextSpawn', { defaultValue: 'Prochain spawn' })}</th>
                <th style={{ ...cellHead, textAlign: 'center' }}>#</th>
                <th style={cellHead}>{t('workOrders:recurring.colStatus', { defaultValue: 'Statut' })}</th>
                <th style={{ ...cellHead, textAlign: 'right' }}>{t('workOrders:recurring.colActions', { defaultValue: 'Actions' })}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const tt = taskTypeById.get(r.taskTypeId);
                const client = clientById.get(r.clientId);
                const tech = r.assignedToId ? techById.get(r.assignedToId) : null;
                const clientLabel = client
                  ? client.companyName ||
                    `${client.firstName ?? ''} ${client.lastName ?? ''}`.trim() ||
                    r.clientId
                  : '—';
                const techLabel = tech
                  ? `${tech.firstName ?? ''} ${tech.lastName ?? ''}`.trim()
                  : null;
                const templateLabel =
                  (tt as unknown as { template?: { name?: string } })?.template?.name ?? null;
                return (
                  <tr
                    key={r.id}
                    style={{
                      borderTop: `1px solid ${theme.colors.border}`,
                      opacity: r.isActive ? 1 : 0.55,
                    }}
                  >
                    <td style={cell}>
                      <div style={{ fontWeight: 600 }}>{r.name}</div>
                      {r.description && (
                        <div style={{ fontSize: 11, color: theme.colors.textMuted }}>
                          {r.description}
                        </div>
                      )}
                    </td>
                    <td style={cell}>
                      <div>{tt?.name ?? '—'}</div>
                      {templateLabel && (
                        <div style={{ fontSize: 11, color: theme.colors.textMuted }}>
                          📋 {templateLabel}
                        </div>
                      )}
                    </td>
                    <td style={cell}>{clientLabel}</td>
                    <td style={cell}>
                      {techLabel ? (
                        <span>👷 {techLabel}</span>
                      ) : (
                        <span style={{ color: theme.colors.textMuted, fontStyle: 'italic' }}>
                          {t('workOrders:recurring.unassigned', { defaultValue: 'Non assigné' })}
                        </span>
                      )}
                    </td>
                    <td style={cell}>
                      {r.frequency} × {r.interval}
                    </td>
                    <td style={{ ...cell, fontSize: 12 }}>{formatDate(r.nextRunAt)}</td>
                    <td style={{ ...cell, textAlign: 'center' }}>{r.spawnedCount}</td>
                    <td style={cell}>
                      {r.isActive ? (
                        <Pill kind="ok">{t('workOrders:recurring.active', { defaultValue: 'Actif' })}</Pill>
                      ) : (
                        <Pill kind="muted">{t('workOrders:recurring.paused', { defaultValue: 'En pause' })}</Pill>
                      )}
                    </td>
                    <td style={{ ...cell, textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button style={rowBtn} onClick={() => setEditing(r)}>
                        ✏️
                      </button>
                      <button
                        style={rowBtn}
                        onClick={() => toggle.mutate({ id: r.id, isActive: !r.isActive })}
                      >
                        {r.isActive ? '⏸' : '▶️'}
                      </button>
                      <button
                        style={{ ...rowBtn, color: theme.colors.danger }}
                        onClick={() => {
                          if (window.confirm(t('workOrders:recurring.confirmDelete', { defaultValue: 'Supprimer « {{name}} » ?', name: r.name }))) remove.mutate(r.id);
                        }}
                      >
                        🗑
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {editing !== undefined && (
        <EditModal
          existing={editing}
          onClose={() => setEditing(undefined)}
          onSaved={() => {
            setEditing(undefined);
            queryClient.invalidateQueries({ queryKey: ['recurring'] });
          }}
        />
      )}
    </div>
  );
}

// ─── Edit modal ───────────────────────────────────────────────────

function EditModal({
  existing,
  onClose,
  onSaved,
}: {
  existing: RecurringWorkOrder | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation('workOrders');
  const isNew = existing === null;
  const [name, setName] = useState(existing?.name ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [taskTypeId, setTaskTypeId] = useState(existing?.taskTypeId ?? '');
  const [clientId, setClientId] = useState(existing?.clientId ?? '');
  const [assignedToId, setAssignedToId] = useState(existing?.assignedToId ?? '');
  const [workOrderTitle, setWorkOrderTitle] = useState(existing?.workOrderTitle ?? '');
  const [workOrderDescription, setWorkOrderDescription] = useState(
    existing?.workOrderDescription ?? '',
  );
  const [priority, setPriority] = useState(existing?.priority ?? 0);
  const [frequency, setFrequency] = useState<Frequency>(existing?.frequency ?? 'MONTHLY');
  const [interval_, setInterval_] = useState(existing?.interval ?? 1);
  const [byDayOfWeek, setByDayOfWeek] = useState<number[]>(existing?.byDayOfWeek ?? []);
  // Keep the raw text so the user can type freely (« 1, 15 » or « 1-5, 10 »).
  // Parsing happens at buildInput() time — not on every keystroke — so
  // commas and dashes don't disappear as they type.
  const [byDayOfMonthText, setByDayOfMonthText] = useState<string>(
    (existing?.byDayOfMonth ?? []).join(', '),
  );
  const [startDate, setStartDate] = useState<string>(
    existing?.startDate?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
  );
  const [endDate, setEndDate] = useState<string>(existing?.endDate?.slice(0, 10) ?? '');
  const [preview, setPreview] = useState<string[]>([]);

  const { data: taskTypes } = useTaskTypes(true);
  // Backend caps limit at 100 — that's ~all clients for a typical small tenant.
  const clientsQuery = useV3Clients({ limit: 100 });
  const { data: technicians } = useTechnicians();

  const missingFields = useMemo(() => {
    const m: string[] = [];
    if (!name.trim()) m.push(t('workOrders:recurring.fieldName', { defaultValue: 'Nom' }));
    if (!taskTypeId) m.push(t('workOrders:recurring.fieldTaskType', { defaultValue: 'Type de tâche' }));
    if (!clientId) m.push(t('workOrders:recurring.fieldClient', { defaultValue: 'Client' }));
    if (!startDate) m.push(t('workOrders:recurring.fieldStartDate', { defaultValue: 'Date de début' }));
    return m;
  }, [name, taskTypeId, clientId, startDate]);

  /**
   * Parse the raw days-of-month text. Accepts:
   *   « 1, 15 »   → [1, 15]
   *   « 1-5 »     → [1, 2, 3, 4, 5]
   *   « 1-3, 10, 20-22 » → [1,2,3,10,20,21,22]
   * Silently drops out-of-range or nonsense values.
   */
  const parsedDaysOfMonth = useMemo(() => {
    const out = new Set<number>();
    for (const raw of byDayOfMonthText.split(',')) {
      const chunk = raw.trim();
      if (!chunk) continue;
      const range = chunk.match(/^(\d+)\s*-\s*(\d+)$/);
      if (range) {
        const from = parseInt(range[1], 10);
        const to = parseInt(range[2], 10);
        if (from <= to) {
          for (let i = from; i <= to; i++) {
            if (i >= 1 && i <= 31) out.add(i);
          }
        }
        continue;
      }
      const n = parseInt(chunk, 10);
      if (Number.isInteger(n) && n >= 1 && n <= 31) out.add(n);
    }
    return [...out].sort((a, b) => a - b);
  }, [byDayOfMonthText]);

  const buildInput = (): CreateRecurringInput | null => {
    if (missingFields.length > 0) return null;
    return {
      name: name.trim(),
      description,
      taskTypeId,
      clientId,
      assignedToId: assignedToId || null,
      workOrderTitle,
      workOrderDescription,
      priority,
      frequency,
      interval: interval_,
      byDayOfWeek: frequency === 'WEEKLY' ? byDayOfWeek : [],
      byDayOfMonth: frequency === 'MONTHLY' ? parsedDaysOfMonth : [],
      startDate: new Date(startDate).toISOString(),
      endDate: endDate ? new Date(endDate).toISOString() : null,
    };
  };

  // Refresh preview whenever the schedule changes.
  useEffect(() => {
    const input = buildInput();
    if (!input) {
      setPreview([]);
      return;
    }
    let cancelled = false;
    previewRecurring(input, 5)
      .then((r) => {
        if (!cancelled) setPreview(r);
      })
      .catch(() => {
        if (!cancelled) setPreview([]);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    frequency,
    interval_,
    startDate,
    endDate,
    byDayOfWeek.join(','),
    parsedDaysOfMonth.join(','),
    taskTypeId,
    clientId,
    name,
  ]);

  const save = useMutation({
    mutationFn: (input: CreateRecurringInput) =>
      isNew ? createRecurring(input) : updateRecurring(existing!.id, input),
    onSuccess: () => {
      toast.success(isNew ? t('workOrders:recurring.created', { defaultValue: 'Créé' }) : t('workOrders:recurring.updated', { defaultValue: 'Mis à jour' }));
      onSaved();
    },
    onError: (err: unknown) => {
      // Axios errors: extract the message the backend actually sent.
      const axiosErr = err as { response?: { data?: { message?: string | string[] } } };
      const raw = axiosErr?.response?.data?.message;
      const msg = Array.isArray(raw)
        ? raw.join(' · ')
        : raw ?? (err instanceof Error ? err.message : t('workOrders:recurring.unknownError', { defaultValue: 'Erreur inconnue' }));
      toast.error(msg);
    },
  });

  const clients = useMemo(
    () => (clientsQuery.data?.data ?? []) as Array<{ id: string; firstName?: string; lastName?: string; companyName?: string | null }>,
    [clientsQuery.data],
  );

  return (
    <ModalShell onClose={onClose}>
      <h2 style={{ margin: 0 }}>{isNew ? `➕ ${t('workOrders:recurring.newRuleTitle', { defaultValue: 'Nouvelle règle' })}` : `✏️ ${t('workOrders:recurring.editTitle', { defaultValue: 'Modifier' })}`}</h2>

      <Field label={t('workOrders:recurring.labelName', { defaultValue: 'Nom' })}>
        <input style={formStyles.input} value={name} onChange={(e) => setName(e.target.value)} />
      </Field>

      <Field label={t('workOrders:recurring.labelDescription', { defaultValue: 'Description' })}>
        <input
          style={formStyles.input}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </Field>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <Field label={t('workOrders:recurring.labelTaskType', { defaultValue: 'Type de tâche' })}>
          <select
            style={formStyles.input}
            value={taskTypeId}
            onChange={(e) => setTaskTypeId(e.target.value)}
          >
            <option value="">{t('workOrders:recurring.choose', { defaultValue: '— Choisir —' })}</option>
            {(taskTypes ?? []).map((tt) => (
              <option key={tt.id} value={tt.id}>
                {tt.name}
              </option>
            ))}
          </select>
          {(taskTypes ?? []).length === 0 && (
            <div style={{ fontSize: 11, color: theme.colors.warning, marginTop: 4 }}>
              {t('workOrders:recurring.noTaskTypeConfigured', { defaultValue: 'Aucun type de tâche configuré. Créez-en un dans Paramètres → Types de tâche.' })}
            </div>
          )}
        </Field>
        <Field label={t('workOrders:recurring.labelClient', { defaultValue: 'Client' })}>
          <select
            style={formStyles.input}
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
          >
            <option value="">{t('workOrders:recurring.choose', { defaultValue: '— Choisir —' })}</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.companyName || `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim() || c.id}
              </option>
            ))}
          </select>
          {clients.length === 0 && (
            <div style={{ fontSize: 11, color: theme.colors.warning, marginTop: 4 }}>
              {t('workOrders:recurring.noClientConfigured', { defaultValue: 'Aucun client configuré. Créez-en un depuis la page Clients.' })}
            </div>
          )}
        </Field>
      </div>

      <Field label={t('workOrders:recurring.labelDefaultTech', { defaultValue: 'Technicien par défaut (optionnel)' })}>
        <select
          style={formStyles.input}
          value={assignedToId}
          onChange={(e) => setAssignedToId(e.target.value)}
        >
          <option value="">{t('workOrders:recurring.none', { defaultValue: 'Aucun' })}</option>
          {(technicians ?? []).map((tech) => (
            <option key={tech.id} value={tech.id}>
              {tech.firstName} {tech.lastName}
            </option>
          ))}
        </select>
      </Field>

      <Field label={t('workOrders:recurring.labelWoTitle', { defaultValue: 'Titre du BT (utilise {{token}} pour la date du run)', token: '{{date}}' })}>
        <input
          style={formStyles.input}
          value={workOrderTitle}
          onChange={(e) => setWorkOrderTitle(e.target.value)}
          placeholder={t('workOrders:recurring.woTitlePlaceholder', { defaultValue: 'Inspection {{token}}', token: '{{date}}' })}
        />
      </Field>

      <Field label={t('workOrders:recurring.labelWoDescription', { defaultValue: 'Description du BT' })}>
        <textarea
          style={{ ...formStyles.input, minHeight: 60, fontFamily: 'inherit' }}
          value={workOrderDescription}
          onChange={(e) => setWorkOrderDescription(e.target.value)}
        />
      </Field>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <Field label={t('workOrders:recurring.labelFrequency', { defaultValue: 'Fréquence' })}>
          <select
            style={formStyles.input}
            value={frequency}
            onChange={(e) => setFrequency(e.target.value as Frequency)}
          >
            <option value="DAILY">{t('workOrders:recurring.freqDaily', { defaultValue: 'Journalière' })}</option>
            <option value="WEEKLY">{t('workOrders:recurring.freqWeekly', { defaultValue: 'Hebdomadaire' })}</option>
            <option value="MONTHLY">{t('workOrders:recurring.freqMonthly', { defaultValue: 'Mensuelle' })}</option>
            <option value="YEARLY">{t('workOrders:recurring.freqYearly', { defaultValue: 'Annuelle' })}</option>
          </select>
        </Field>
        <Field label={t('workOrders:recurring.labelInterval', { defaultValue: 'Intervalle (× fréquence)' })}>
          <input
            type="number"
            min={1}
            max={366}
            style={formStyles.input}
            value={interval_}
            onChange={(e) => setInterval_(Number(e.target.value) || 1)}
          />
        </Field>
      </div>

      {frequency === 'WEEKLY' && (
        <Field label={t('workOrders:recurring.labelDaysOfWeek', { defaultValue: 'Jours de la semaine' })}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {[
              t('workOrders:recurring.daySun', { defaultValue: 'Dim' }),
              t('workOrders:recurring.dayMon', { defaultValue: 'Lun' }),
              t('workOrders:recurring.dayTue', { defaultValue: 'Mar' }),
              t('workOrders:recurring.dayWed', { defaultValue: 'Mer' }),
              t('workOrders:recurring.dayThu', { defaultValue: 'Jeu' }),
              t('workOrders:recurring.dayFri', { defaultValue: 'Ven' }),
              t('workOrders:recurring.daySat', { defaultValue: 'Sam' }),
            ].map((label, i) => (
              <label key={i} style={{ fontSize: 12, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={byDayOfWeek.includes(i)}
                  onChange={() =>
                    setByDayOfWeek((prev) =>
                      prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i],
                    )
                  }
                />{' '}
                {label}
              </label>
            ))}
          </div>
        </Field>
      )}

      {frequency === 'MONTHLY' && (
        <Field label={t('workOrders:recurring.labelDaysOfMonth', { defaultValue: 'Jours du mois (1-31, laisser vide = jour de la date de début)' })}>
          <input
            style={formStyles.input}
            value={byDayOfMonthText}
            onChange={(e) => setByDayOfMonthText(e.target.value)}
            placeholder={t('workOrders:recurring.daysOfMonthPlaceholder', { defaultValue: 'ex. 1, 15  ou  1-5, 20' })}
          />
          {parsedDaysOfMonth.length > 0 && (
            <div style={{ fontSize: 11, color: theme.colors.textMuted, marginTop: 4 }}>
              → {t('workOrders:recurring.retainedDays', { defaultValue: 'jours retenus : {{days}}', days: parsedDaysOfMonth.join(', ') })}
            </div>
          )}
        </Field>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <Field label={t('workOrders:recurring.labelStartDate', { defaultValue: 'Date de début' })}>
          <input
            type="date"
            style={formStyles.input}
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </Field>
        <Field label={t('workOrders:recurring.labelEndDate', { defaultValue: 'Date de fin (optionnel)' })}>
          <input
            type="date"
            style={formStyles.input}
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </Field>
      </div>

      <div
        style={{
          background: theme.colors.surfaceAlt,
          border: `1px dashed ${theme.colors.border}`,
          borderRadius: 6,
          padding: 12,
          marginTop: 12,
        }}
      >
        <div style={{ fontSize: 11, color: theme.colors.textMuted, marginBottom: 4 }}>
          {t('workOrders:recurring.previewTitle', { defaultValue: 'Aperçu des 5 prochains spawns' })}
        </div>
        {preview.length === 0 ? (
          <div style={{ fontSize: 12, color: theme.colors.textMuted, fontStyle: 'italic' }}>
            {t('workOrders:recurring.scheduleIncomplete', { defaultValue: '(schedule incomplet)' })}
          </div>
        ) : (
          <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12 }}>
            {preview.map((iso) => (
              <li key={iso}>{formatDate(iso)}</li>
            ))}
          </ul>
        )}
      </div>

      {missingFields.length > 0 && (
        <div
          style={{
            marginTop: 12,
            padding: 10,
            background: 'var(--c-warningLight)',
            border: '1px solid #fbbf24',
            borderRadius: 6,
            color: '#78350f',
            fontSize: 12,
          }}
        >
          ⚠️ {t('workOrders:recurring.missingFields', { defaultValue: 'Champs manquants : {{fields}}', fields: missingFields.join(', ') })}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <button style={buttonStyles.secondary} onClick={onClose}>
          {t('workOrders:recurring.cancel', { defaultValue: 'Annuler' })}
        </button>
        <button
          style={buttonStyles.primary}
          disabled={save.isPending}
          onClick={() => {
            const input = buildInput();
            if (!input) {
              toast.error(
                t('workOrders:recurring.cannotCreate', {
                  defaultValue: 'Impossible de créer : {{fields}} obligatoire{{plural}}.',
                  fields: missingFields.join(', '),
                  plural: missingFields.length > 1 ? 's' : '',
                }),
              );
              return;
            }
            save.mutate(input);
          }}
        >
          {save.isPending ? t('workOrders:recurring.saving', { defaultValue: 'Enregistrement…' }) : isNew ? t('workOrders:recurring.create', { defaultValue: 'Créer' }) : t('workOrders:recurring.save', { defaultValue: 'Enregistrer' })}
        </button>
      </div>
    </ModalShell>
  );
}

// ─── Small primitives ──────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 8 }}>
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          marginBottom: 3,
          color: theme.colors.text,
          textTransform: 'uppercase',
        }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}

function ModalShell({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.4)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          ...cardStyles.card,
          padding: 24,
          maxWidth: 600,
          width: '92%',
          maxHeight: '92vh',
          overflowY: 'auto',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

function Pill({ children, kind }: { children: React.ReactNode; kind: 'ok' | 'muted' }) {
  const c = kind === 'ok' ? { bg: '#d1fae5', fg: 'var(--c-successBadgeText)' } : { bg: '#e5e7eb', fg: '#374151' };
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: 12,
        background: c.bg,
        color: c.fg,
        fontSize: 11,
        fontWeight: 600,
      }}
    >
      {children}
    </span>
  );
}

const cellHead: React.CSSProperties = { padding: '8px 12px', textAlign: 'left', fontWeight: 600 };
const cell: React.CSSProperties = { padding: '10px 12px', fontSize: 13, verticalAlign: 'top' };
const rowBtn: React.CSSProperties = {
  background: 'transparent',
  border: `1px solid ${theme.colors.border}`,
  borderRadius: 4,
  padding: '4px 8px',
  fontSize: 11,
  cursor: 'pointer',
  marginLeft: 4,
};

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}
