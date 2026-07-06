import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  useCreatePart,
  useDeletePart,
  usePartMovements,
  useParts,
  useStockByTechnician,
  useStockOperation,
  useUpdatePart,
} from '../hooks/useParts';
import { useTechnicians } from '../hooks/useUsers';
import { partName, type Part } from '../services/parts.service';
import {
  theme,
  cardStyles,
  buttonStyles,
  formStyles,
  tableStyles,
  modalStyles,
  layoutStyles,
} from '../theme';
import { toast } from '../context/toast.store';
import { formatDateTime } from '../utils/dateFormat';

/** B24 — inventory: catalog table + stock operations + history. */

type StockOpKind = 'receive' | 'adjust' | 'transfer';

function showApiError(err: unknown) {
  const msg =
    (err as { response?: { data?: { message?: string | string[] } } })?.response?.data
      ?.message ?? String(err);
  toast.error(Array.isArray(msg) ? msg.join(', ') : String(msg));
}

// ─── Part create/edit modal ───────────────────────────────────────────────────

function PartModal({ part, onClose }: { part: Part | null; onClose: () => void }) {
  const { t } = useTranslation('inventory');
  const createPart = useCreatePart();
  const updatePart = useUpdatePart();
  const [form, setForm] = useState({
    sku: part?.sku ?? '',
    nameFr: part?.nameFr || part?.name || '',
    nameEn: part?.nameEn ?? '',
    description: part?.description ?? '',
    unit: part?.unit ?? 'un',
    costPrice: part ? String(part.costPrice) : '0',
    salePrice: part ? String(part.salePrice) : '0',
    minStock: part ? String(part.minStock) : '0',
    isActive: part?.isActive ?? true,
  });
  const saving = createPart.isPending || updatePart.isPending;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    const dto = {
      sku: form.sku.trim(),
      name: form.nameFr.trim() || form.nameEn.trim(),
      nameFr: form.nameFr.trim(),
      nameEn: form.nameEn.trim(),
      description: form.description.trim() || undefined,
      unit: form.unit.trim() || 'un',
      costPrice: Number(form.costPrice) || 0,
      salePrice: Number(form.salePrice) || 0,
      minStock: parseInt(form.minStock, 10) || 0,
    };
    try {
      if (part) {
        await updatePart.mutateAsync({ id: part.id, dto: { ...dto, isActive: form.isActive } });
      } else {
        await createPart.mutateAsync(dto);
      }
      onClose();
    } catch (err) {
      showApiError(err);
    }
  }

  const field = (label: string, node: React.ReactNode) => (
    <div>
      <label style={formStyles.label}>{label}</label>
      {node}
    </div>
  );

  return (
    <div style={modalStyles.overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={{ ...modalStyles.content, maxWidth: 540 }}>
        <div style={modalStyles.header}>
          <h2 style={modalStyles.headerTitle}>{part ? t('modal.editTitle') : t('modal.createTitle')}</h2>
          <button onClick={onClose} style={{ ...buttonStyles.ghost, padding: '0.25rem 0.5rem' }}>✕</button>
        </div>
        <form onSubmit={handleSubmit} style={{ ...modalStyles.body, display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            {field(t('modal.sku'), (
              <input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} style={{ ...formStyles.input, fontFamily: 'monospace' }} required />
            ))}
            {field(t('modal.unit'), (
              <input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} style={formStyles.input} placeholder={t('modal.unitHint')} />
            ))}
            {field(t('modal.nameFr'), (
              <input value={form.nameFr} onChange={(e) => setForm({ ...form, nameFr: e.target.value })} style={formStyles.input} required />
            ))}
            {field(t('modal.nameEn'), (
              <input value={form.nameEn} onChange={(e) => setForm({ ...form, nameEn: e.target.value })} style={formStyles.input} />
            ))}
            {field(t('modal.costPrice'), (
              <input type="number" min={0} step="0.01" value={form.costPrice} onChange={(e) => setForm({ ...form, costPrice: e.target.value })} style={formStyles.input} />
            ))}
            {field(t('modal.salePrice'), (
              <input type="number" min={0} step="0.01" value={form.salePrice} onChange={(e) => setForm({ ...form, salePrice: e.target.value })} style={formStyles.input} />
            ))}
          </div>
          {field(t('modal.description'), (
            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} style={{ ...formStyles.textarea, resize: 'vertical' }} />
          ))}
          {field(t('modal.minStock'), (
            <input type="number" min={0} value={form.minStock} onChange={(e) => setForm({ ...form, minStock: e.target.value })} style={{ ...formStyles.input, width: 140 }} />
          ))}
          {part && (
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: theme.font.sizeSm, color: theme.colors.text }}>
              <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
              {t('modal.active')}
            </label>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
            <button type="button" onClick={onClose} style={buttonStyles.secondary}>{t('modal.cancel')}</button>
            <button type="submit" disabled={saving} style={{ ...buttonStyles.primary, opacity: saving ? 0.6 : 1 }}>
              {t('modal.save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Stock operation modal ────────────────────────────────────────────────────

function StockOpModal({
  part,
  kind,
  onClose,
}: {
  part: Part;
  kind: StockOpKind;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation('inventory');
  const locale = i18n.language ?? 'fr';
  const technicians = useTechnicians();
  const op = useStockOperation();
  const [quantity, setQuantity] = useState(kind === 'adjust' ? '' : '1');
  const [note, setNote] = useState('');
  const [technicianId, setTechnicianId] = useState('');
  const [direction, setDirection] = useState<'TO_TECH' | 'TO_WAREHOUSE'>('TO_TECH');

  const titles: Record<StockOpKind, string> = {
    receive: t('stockModal.receiveTitle'),
    adjust: t('stockModal.adjustTitle'),
    transfer: t('stockModal.transferTitle'),
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const qty = parseInt(quantity, 10);
    if (!Number.isFinite(qty) || op.isPending) return;
    try {
      if (kind === 'receive') {
        await op.mutateAsync({ kind, partId: part.id, quantity: qty, note: note.trim() || undefined });
      } else if (kind === 'adjust') {
        await op.mutateAsync({ kind, partId: part.id, quantity: qty, note: note.trim(), technicianId: technicianId || undefined });
      } else {
        await op.mutateAsync({ kind, partId: part.id, technicianId, quantity: qty, direction });
      }
      toast.success(t('stockModal.success'));
      onClose();
    } catch (err) {
      showApiError(err);
    }
  }

  const canSubmit =
    quantity !== '' &&
    (kind !== 'transfer' || !!technicianId) &&
    (kind !== 'adjust' || note.trim().length > 0);

  return (
    <div style={modalStyles.overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={{ ...modalStyles.content, maxWidth: 420 }}>
        <div style={modalStyles.header}>
          <h2 style={modalStyles.headerTitle}>{titles[kind]}</h2>
          <button onClick={onClose} style={{ ...buttonStyles.ghost, padding: '0.25rem 0.5rem' }}>✕</button>
        </div>
        <form onSubmit={handleSubmit} style={{ ...modalStyles.body, display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          <p style={{ margin: 0, fontSize: theme.font.sizeSm, color: theme.colors.textSecondary }}>
            <span style={{ fontFamily: 'monospace' }}>{part.sku}</span> — {partName(part, locale)}
          </p>

          <div>
            <label style={formStyles.label}>
              {kind === 'adjust' ? t('stockModal.delta') : t('stockModal.quantity')}
            </label>
            <input
              type="number"
              value={quantity}
              min={kind === 'adjust' ? undefined : 1}
              onChange={(e) => setQuantity(e.target.value)}
              style={{ ...formStyles.input, width: 140 }}
              required
            />
          </div>

          {kind === 'transfer' && (
            <>
              <div>
                <label style={formStyles.label}>{t('stockModal.direction')}</label>
                <select value={direction} onChange={(e) => setDirection(e.target.value as 'TO_TECH' | 'TO_WAREHOUSE')} style={formStyles.select}>
                  <option value="TO_TECH">{t('stockModal.toTech')}</option>
                  <option value="TO_WAREHOUSE">{t('stockModal.toWarehouse')}</option>
                </select>
              </div>
              <div>
                <label style={formStyles.label}>{t('stockModal.technician')}</label>
                <select value={technicianId} onChange={(e) => setTechnicianId(e.target.value)} style={formStyles.select} required>
                  <option value="">—</option>
                  {(technicians.data ?? []).map((tech) => (
                    <option key={tech.id} value={tech.id}>{tech.firstName} {tech.lastName}</option>
                  ))}
                </select>
              </div>
            </>
          )}

          {kind === 'adjust' && (
            <div>
              <label style={formStyles.label}>{t('stockModal.technician')}</label>
              <select value={technicianId} onChange={(e) => setTechnicianId(e.target.value)} style={formStyles.select}>
                <option value="">{t('stockModal.warehouseTarget')}</option>
                {(technicians.data ?? []).map((tech) => (
                  <option key={tech.id} value={tech.id}>{tech.firstName} {tech.lastName}</option>
                ))}
              </select>
            </div>
          )}

          {kind !== 'transfer' && (
            <div>
              <label style={formStyles.label}>{t('stockModal.note')}</label>
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={t('stockModal.notePlaceholder')}
                style={formStyles.input}
                required={kind === 'adjust'}
              />
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
            <button type="button" onClick={onClose} style={buttonStyles.secondary}>{t('modal.cancel')}</button>
            <button type="submit" disabled={!canSubmit || op.isPending} style={{ ...buttonStyles.primary, opacity: !canSubmit || op.isPending ? 0.6 : 1 }}>
              {t('stockModal.submit')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── History modal ────────────────────────────────────────────────────────────

function HistoryModal({ part, onClose }: { part: Part; onClose: () => void }) {
  const { t, i18n } = useTranslation('inventory');
  const locale = i18n.language ?? 'fr';
  const movements = usePartMovements(part.id);

  return (
    <div style={modalStyles.overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={{ ...modalStyles.content, maxWidth: 620 }}>
        <div style={modalStyles.header}>
          <h2 style={modalStyles.headerTitle}>
            {t('history.title')} — <span style={{ fontFamily: 'monospace' }}>{part.sku}</span>
          </h2>
          <button onClick={onClose} style={{ ...buttonStyles.ghost, padding: '0.25rem 0.5rem' }}>✕</button>
        </div>
        <div style={{ ...modalStyles.body, maxHeight: '60vh', overflowY: 'auto' }}>
          {(movements.data?.items ?? []).length === 0 ? (
            <p style={{ color: theme.colors.textMuted, fontSize: theme.font.sizeSm }}>{t('history.empty')}</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              {(movements.data?.items ?? []).map((m) => (
                <div key={m.id} style={{ display: 'flex', gap: '0.6rem', alignItems: 'baseline', padding: '0.45rem 0.6rem', background: theme.colors.surfaceAlt, borderRadius: theme.radius.md, flexWrap: 'wrap' }}>
                  <strong style={{ fontSize: theme.font.sizeSm, color: theme.colors.text, minWidth: 90 }}>
                    {t(`history.types.${m.type}`, { defaultValue: m.type })}
                  </strong>
                  <span style={{ fontSize: theme.font.sizeSm, color: theme.colors.primary }}>
                    {m.type === 'ADJUSTMENT' && m.quantity > 0 ? '+' : ''}{m.quantity}
                  </span>
                  {m.technician && (
                    <span style={{ fontSize: theme.font.sizeXs, color: theme.colors.textMuted }}>
                      🚚 {m.technician.firstName} {m.technician.lastName}
                    </span>
                  )}
                  {m.workOrder && (
                    <span style={{ fontSize: theme.font.sizeXs, fontFamily: 'monospace', color: theme.colors.textMuted }}>
                      {m.workOrder.referenceNumber}
                    </span>
                  )}
                  {m.note && <span style={{ fontSize: theme.font.sizeXs, color: theme.colors.textMuted }}>{m.note}</span>}
                  <span style={{ marginLeft: 'auto', fontSize: theme.font.sizeXs, color: theme.colors.textMuted, whiteSpace: 'nowrap' }}>
                    {formatDateTime(m.createdAt)} — {m.createdBy.firstName} {m.createdBy.lastName}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function InventoryPage() {
  const { t, i18n } = useTranslation('inventory');
  const locale = i18n.language ?? 'fr';
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [showByTechnician, setShowByTechnician] = useState(false);
  const [editing, setEditing] = useState<Part | null>(null);
  const [creating, setCreating] = useState(false);
  const [stockOp, setStockOp] = useState<{ part: Part; kind: StockOpKind } | null>(null);
  const [historyPart, setHistoryPart] = useState<Part | null>(null);

  const parts = useParts(search, showInactive);
  const byTechnician = useStockByTechnician();
  const deletePart = useDeletePart();

  async function handleDeactivate(part: Part) {
    try {
      await deletePart.mutateAsync(part.id);
      toast.success(t('actions.deactivate') + ' ✓');
    } catch (err) {
      showApiError(err);
    }
  }

  const money = (n: number) => `${n.toFixed(2)} $`;

  return (
    <div style={layoutStyles.page}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '0.5rem' }}>
        <div>
          <h1 style={{ ...layoutStyles.pageTitle, marginBottom: '0.15rem' }}>📦 {t('title')}</h1>
          <p style={{ margin: 0, fontSize: theme.font.sizeSm, color: theme.colors.textMuted }}>{t('subtitle')}</p>
        </div>
        <button onClick={() => setCreating(true)} style={buttonStyles.primary}>
          ➕ {t('newPart')}
        </button>
      </div>

      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap', margin: '0.75rem 0' }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('searchPlaceholder')}
          style={{ ...formStyles.input, maxWidth: 280 }}
        />
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: theme.font.sizeSm, color: theme.colors.textSecondary }}>
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
          {t('showInactive')}
        </label>
        <button
          onClick={() => setShowByTechnician((v) => !v)}
          style={{ ...buttonStyles.secondary, ...buttonStyles.sm, marginLeft: 'auto' }}
        >
          🚚 {t('byTechnician.title')}
        </button>
      </div>

      {showByTechnician && (
        <div style={{ ...cardStyles.card, padding: '1rem', marginBottom: '1rem' }}>
          <h2 style={{ margin: '0 0 0.6rem', fontSize: theme.font.sizeMd, color: theme.colors.text }}>
            🚚 {t('byTechnician.title')}
          </h2>
          {(byTechnician.data ?? []).length === 0 ? (
            <p style={{ margin: 0, fontSize: theme.font.sizeSm, color: theme.colors.textMuted }}>{t('byTechnician.empty')}</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
              {(byTechnician.data ?? []).map((row) => (
                <div key={row.id} style={{ display: 'flex', gap: '0.6rem', fontSize: theme.font.sizeSm, color: theme.colors.text, flexWrap: 'wrap' }}>
                  <strong style={{ minWidth: 160 }}>{row.technician.firstName} {row.technician.lastName}</strong>
                  <span style={{ fontFamily: 'monospace', color: theme.colors.textMuted }}>{row.part.sku}</span>
                  <span style={{ flex: 1 }}>{partName(row.part, locale)}</span>
                  <span>{row.quantity} {row.part.unit}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {(parts.data ?? []).length === 0 && !parts.isLoading ? (
        <div style={{ ...cardStyles.card, padding: '2rem', textAlign: 'center' }}>
          <p style={{ margin: 0, color: theme.colors.textMuted }}>{t('empty')}</p>
        </div>
      ) : (
        <div style={{ ...cardStyles.card, padding: 0, overflowX: 'auto' }}>
          <table style={{ ...tableStyles.table, minWidth: 760 }}>
            <thead>
              <tr>
                <th style={tableStyles.th}>{t('columns.sku')}</th>
                <th style={tableStyles.th}>{t('columns.name')}</th>
                <th style={tableStyles.th}>{t('columns.cost')}</th>
                <th style={tableStyles.th}>{t('columns.sale')}</th>
                <th style={tableStyles.th}>{t('columns.warehouse')}</th>
                <th style={tableStyles.th}>{t('columns.trucks')}</th>
                <th style={tableStyles.th}>{t('columns.minStock')}</th>
                <th style={tableStyles.th}></th>
              </tr>
            </thead>
            <tbody>
              {(parts.data ?? []).map((part) => (
                <tr key={part.id} style={{ ...tableStyles.tr, opacity: part.isActive ? 1 : 0.55 }}>
                  <td style={{ ...tableStyles.td, fontFamily: 'monospace', fontSize: theme.font.sizeSm, whiteSpace: 'nowrap' }}>{part.sku}</td>
                  <td style={tableStyles.td}>
                    {partName(part, locale)}
                    {part.lowStock && (
                      <span style={{ marginLeft: 8, fontSize: theme.font.sizeXs, color: '#b45309', background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 999, padding: '0.1rem 0.5rem', whiteSpace: 'nowrap' }}>
                        🔻 {t('lowStock')}
                      </span>
                    )}
                    {!part.isActive && (
                      <span style={{ marginLeft: 8, fontSize: theme.font.sizeXs, color: theme.colors.textMuted }}>
                        ({t('inactive')})
                      </span>
                    )}
                  </td>
                  <td style={{ ...tableStyles.td, whiteSpace: 'nowrap' }}>{money(part.costPrice)}</td>
                  <td style={{ ...tableStyles.td, whiteSpace: 'nowrap' }}>{money(part.salePrice)}</td>
                  <td style={{ ...tableStyles.td, fontWeight: 600, color: part.lowStock ? '#b45309' : theme.colors.text }}>
                    {part.quantityOnHand}
                  </td>
                  <td style={tableStyles.td}>{part.truckQuantity}</td>
                  <td style={tableStyles.td}>{part.minStock || '—'}</td>
                  <td style={{ ...tableStyles.td, whiteSpace: 'nowrap', textAlign: 'right' }}>
                    <button title={t('actions.receive')} onClick={() => setStockOp({ part, kind: 'receive' })} style={{ ...buttonStyles.ghost, padding: '0.2rem 0.4rem' }}>➕</button>
                    <button title={t('actions.transfer')} onClick={() => setStockOp({ part, kind: 'transfer' })} style={{ ...buttonStyles.ghost, padding: '0.2rem 0.4rem' }}>🚚</button>
                    <button title={t('actions.adjust')} onClick={() => setStockOp({ part, kind: 'adjust' })} style={{ ...buttonStyles.ghost, padding: '0.2rem 0.4rem' }}>🧮</button>
                    <button title={t('actions.history')} onClick={() => setHistoryPart(part)} style={{ ...buttonStyles.ghost, padding: '0.2rem 0.4rem' }}>🕘</button>
                    <button title={t('actions.edit')} onClick={() => setEditing(part)} style={{ ...buttonStyles.ghost, padding: '0.2rem 0.4rem' }}>✏️</button>
                    {part.isActive && (
                      <button title={t('actions.deactivate')} onClick={() => handleDeactivate(part)} style={{ ...buttonStyles.ghost, padding: '0.2rem 0.4rem', color: theme.colors.danger }}>🚫</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(creating || editing) && (
        <PartModal part={editing} onClose={() => { setCreating(false); setEditing(null); }} />
      )}
      {stockOp && <StockOpModal part={stockOp.part} kind={stockOp.kind} onClose={() => setStockOp(null)} />}
      {historyPart && <HistoryModal part={historyPart} onClose={() => setHistoryPart(null)} />}
    </div>
  );
}
