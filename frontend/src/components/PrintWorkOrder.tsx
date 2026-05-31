import type { WorkOrder } from '../types';
import { WorkOrderStatus, WorkOrderType } from '../types';

// ─── Label maps ───────────────────────────────────────────────────────────────

const STATUS_FR: Record<WorkOrderStatus, string> = {
  [WorkOrderStatus.CREATED]: 'Créé',
  [WorkOrderStatus.ASSIGNED]: 'Assigné',
  [WorkOrderStatus.DISPATCHED]: 'Réparti',
  [WorkOrderStatus.EN_ROUTE]: 'En route',
  [WorkOrderStatus.IN_PROGRESS]: 'En cours',
  [WorkOrderStatus.COMPLETED_POSITIVE]: 'Terminé (positif)',
  [WorkOrderStatus.COMPLETED_NEGATIVE]: 'Terminé (négatif)',
};

const TYPE_FR: Record<WorkOrderType, string> = {
  [WorkOrderType.INSTALLATION]: 'Installation',
  [WorkOrderType.REPAIR]: 'Réparation',
  [WorkOrderType.MAINTENANCE]: 'Maintenance',
  [WorkOrderType.INSPECTION]: 'Inspection',
  [WorkOrderType.OTHER]: 'Autre',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso?: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('fr-FR');
}

function fmtTime(iso?: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const PRINT_CSS = `
@media print {
  body * { visibility: hidden !important; }
  .print-area {
    display: block !important;
    visibility: visible !important;
    position: absolute;
    left: 0;
    top: 0;
    width: 100%;
  }
  .print-area * { visibility: visible !important; }
  @page {
    size: letter portrait;
    margin: 6mm 10mm 5mm 10mm;
  }
}
`;

const wrap: React.CSSProperties = {
  display: 'none', // hidden on screen; @media print makes it visible
  fontFamily: 'Arial, Helvetica, sans-serif',
  fontSize: '8.5pt',
  color: '#000',
  lineHeight: 1.2,
};

const page: React.CSSProperties = {
  width: '196mm', // letter width (215.9mm) minus 2×10mm margins
  margin: '0 auto',
  padding: 0,
};

const hr: React.CSSProperties = {
  border: 'none',
  borderTop: '1px solid #000',
  margin: '3pt 0',
};

const sectionTitle: React.CSSProperties = {
  fontWeight: 700,
  fontSize: '8pt',
  textTransform: 'uppercase' as const,
  letterSpacing: '0.08em',
  margin: '2pt 0 1pt',
  borderBottom: '1px solid #999',
  paddingBottom: '1pt',
};

const row: React.CSSProperties = {
  display: 'flex',
  gap: '8pt',
  marginBottom: '1pt',
  flexWrap: 'wrap' as const,
};

const field: React.CSSProperties = {
  flex: 1,
  minWidth: '70pt',
};

const labelPrint: React.CSSProperties = {
  fontSize: '6.5pt',
  fontWeight: 700,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.05em',
  display: 'block',
  marginBottom: '0pt',
  color: '#333',
};

const valuePrint: React.CSSProperties = {
  display: 'block',
  fontSize: '8.5pt',
};

const blankLine: React.CSSProperties = {
  display: 'block',
  borderBottom: '1px solid #555',
  margin: '3pt 0 1pt',
  height: '10pt',
};

const checkboxRow: React.CSSProperties = {
  display: 'flex',
  gap: '16pt',
  alignItems: 'center',
  margin: '2pt 0',
};

const signRow: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: '12pt',
  marginTop: '4pt',
};

const signBlock: React.CSSProperties = {
  flex: 1,
};

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  wo: WorkOrder;
}

export default function PrintWorkOrder({ wo }: Props) {
  // Build client display strings
  let clientName = '—';
  let clientPhone = '—';
  let clientAddress = '—';

  if (wo.temporaryClient) {
    const tc = wo.temporaryClient;
    clientName = `${tc.firstName} ${tc.lastName}`;
    clientPhone = tc.phone ?? '—';
    const addrParts = [tc.address, tc.city, tc.postalCode].filter(Boolean);
    clientAddress = addrParts.length > 0 ? addrParts.join(', ') : '—';
  } else if (wo.externalClientName) {
    clientName = wo.externalClientName;
    clientAddress = wo.clientAddress ?? '—';
  }

  // Technician
  const techName = wo.assignedTo
    ? `${wo.assignedTo.firstName} ${wo.assignedTo.lastName}`
    : '—';
  const techPhone = wo.assignedTo?.phone ?? null;

  // Schedule window
  const schedStart = wo.scheduledStartTime ? fmtTime(wo.scheduledStartTime) : null;
  const schedEnd = wo.scheduledEndTime ? fmtTime(wo.scheduledEndTime) : null;
  const schedWindow =
    schedStart && schedEnd ? `${schedStart} – ${schedEnd}` : schedStart ?? schedEnd ?? '—';

  return (
    <>
      {/* Inject @media print CSS — visible only during printing */}
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />

      <div className="print-area" style={wrap}>
        <div style={page}>

          {/* ── Header ─────────────────────────────────────────────────────── */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2pt' }}>
            <div>
              <span style={{ fontWeight: 700, fontSize: '11pt', letterSpacing: '0.04em' }}>
                TASKMGR
              </span>
              <span style={{ fontSize: '7.5pt', color: '#555', marginLeft: '6pt' }}>Gestion des bons de travail</span>
            </div>
            <div style={{ textAlign: 'right' }}>
              <span style={{ fontWeight: 700, fontSize: '10pt', letterSpacing: '0.06em' }}>
                BON DE TRAVAIL
              </span>
              <span style={{ fontSize: '7.5pt', color: '#555', marginLeft: '6pt' }}>
                {new Date().toLocaleDateString('fr-FR')}
              </span>
            </div>
          </div>

          <hr style={hr} />

          {/* ── Identification ──────────────────────────────────────────────── */}
          <div style={row}>
            <div style={field}>
              <span style={labelPrint}>Référence</span>
              <span style={{ ...valuePrint, fontFamily: 'monospace', fontWeight: 700 }}>
                {wo.referenceNumber}
              </span>
            </div>
            <div style={field}>
              <span style={labelPrint}>Date de création</span>
              <span style={valuePrint}>{fmtDate(wo.createdAt)}</span>
            </div>
            <div style={field}>
              <span style={labelPrint}>Statut</span>
              <span style={{ ...valuePrint, fontWeight: 700 }}>{STATUS_FR[wo.status]}</span>
            </div>
            <div style={field}>
              <span style={labelPrint}>Priorité</span>
              <span style={valuePrint}>{wo.priority} / 5</span>
            </div>
          </div>

          <div style={row}>
            <div style={field}>
              <span style={labelPrint}>Type</span>
              <span style={valuePrint}>{TYPE_FR[wo.type]}</span>
            </div>
            <div style={{ flex: 3, minWidth: '120pt' }}>
              <span style={labelPrint}>Titre</span>
              <span style={{ ...valuePrint, fontWeight: 600 }}>{wo.title}</span>
            </div>
          </div>

          {/* ── Description ─────────────────────────────────────────────────── */}
          <div style={sectionTitle}>Description</div>
          <div style={{ whiteSpace: 'pre-wrap', marginBottom: '1pt', fontSize: '8pt', maxHeight: '44pt', overflow: 'hidden' }}>
            {wo.description ?? '—'}
          </div>

          <hr style={hr} />

          {/* ── Client + Technicien (côte à côte) ─────────────────────────── */}
          <div style={{ display: 'flex', gap: '12pt' }}>
            <div style={{ flex: 1 }}>
              <div style={sectionTitle}>Client</div>
              <div style={row}>
                <div style={field}>
                  <span style={labelPrint}>Nom</span>
                  <span style={valuePrint}>{clientName}</span>
                </div>
                <div style={field}>
                  <span style={labelPrint}>Téléphone</span>
                  <span style={valuePrint}>{clientPhone}</span>
                </div>
              </div>
              <div>
                <span style={labelPrint}>Adresse</span>
                <span style={valuePrint}>{clientAddress}</span>
              </div>
            </div>

            <div style={{ flex: 1 }}>
              <div style={sectionTitle}>Technicien assigné</div>
              <div style={row}>
                <div style={field}>
                  <span style={labelPrint}>Nom</span>
                  <span style={valuePrint}>{techName}</span>
                </div>
                {techPhone && (
                  <div style={field}>
                    <span style={labelPrint}>Tél.</span>
                    <span style={valuePrint}>{techPhone}</span>
                  </div>
                )}
              </div>
              <div style={row}>
                <div style={field}>
                  <span style={labelPrint}>Date planifiée</span>
                  <span style={valuePrint}>{fmtDate(wo.scheduledDate)}</span>
                </div>
                <div style={field}>
                  <span style={labelPrint}>Heure</span>
                  <span style={valuePrint}>{schedWindow}</span>
                </div>
              </div>
            </div>
          </div>

          <hr style={hr} />

          {/* ── Notes ───────────────────────────────────────────────────────── */}
          <div style={sectionTitle}>Notes</div>
          {!wo.notes || wo.notes.length === 0 ? (
            <div style={{ color: '#555', fontSize: '8pt', marginBottom: '1pt' }}>Aucune note</div>
          ) : (
            <div style={{ marginBottom: '1pt', fontSize: '8pt' }}>
              {wo.notes.slice(0, 5).map((note) => (
                <div key={note.id} style={{ marginBottom: '1pt', paddingLeft: '6pt' }}>
                  <span>— {note.content}</span>
                  <span style={{ fontSize: '7pt', color: '#666', marginLeft: '4pt' }}>
                    ({note.author.firstName} {note.author.lastName}, {new Date(note.createdAt).toLocaleDateString('fr-FR')})
                  </span>
                </div>
              ))}
              {wo.notes.length > 5 && (
                <div style={{ fontSize: '7pt', color: '#888', paddingLeft: '6pt' }}>
                  ... et {wo.notes.length - 5} autres notes
                </div>
              )}
            </div>
          )}

          {/* Negative reason if applicable */}
          {wo.negativeReason && (
            <div style={{ marginBottom: '1pt' }}>
              <span style={labelPrint}>Raison de la clôture négative</span>
              <span style={{ ...valuePrint, fontSize: '8.5pt' }}>{wo.negativeReason}</span>
            </div>
          )}

          <hr style={hr} />

          {/* ── Zone terrain + Signatures (côte à côte) ─────────────────── */}
          <div style={{ display: 'flex', gap: '12pt' }}>
            <div style={{ flex: 3 }}>
              <div style={sectionTitle}>Zone terrain — à remplir par le technicien</div>
              <div style={{ marginBottom: '2pt' }}>
                <span style={labelPrint}>Travaux effectués</span>
                <span style={blankLine} />
                <span style={blankLine} />
              </div>
              <div style={{ marginBottom: '2pt' }}>
                <span style={labelPrint}>Résultat</span>
                <div style={checkboxRow}>
                  <span>☐ Positif</span>
                  <span>☐ Négatif</span>
                </div>
              </div>
              <div>
                <span style={labelPrint}>Commentaires</span>
                <span style={blankLine} />
              </div>
            </div>

            <div style={{ flex: 2 }}>
              <div style={sectionTitle}>Signatures</div>
              <div style={{ marginBottom: '6pt' }}>
                <span style={{ ...labelPrint, marginBottom: '1pt' }}>Technicien</span>
                <div style={{ borderBottom: '1px solid #000', height: '20pt', marginBottom: '2pt' }} />
                <div style={{ display: 'flex', gap: '4pt' }}>
                  <span style={{ fontSize: '7pt' }}>Date</span>
                  <span style={{ flex: 1, borderBottom: '1px solid #555', display: 'inline-block' }} />
                </div>
              </div>
              <div>
                <span style={{ ...labelPrint, marginBottom: '1pt' }}>Client</span>
                <div style={{ borderBottom: '1px solid #000', height: '20pt', marginBottom: '2pt' }} />
                <div style={{ display: 'flex', gap: '4pt' }}>
                  <span style={{ fontSize: '7pt' }}>Date</span>
                  <span style={{ flex: 1, borderBottom: '1px solid #555', display: 'inline-block' }} />
                </div>
              </div>
            </div>
          </div>

          {/* ── Footer ──────────────────────────────────────────────────────── */}
          <hr style={{ ...hr, marginTop: '4pt' }} />
          <div style={{ fontSize: '6.5pt', color: '#888', textAlign: 'center' }}>
            TaskMgr — Réf. {wo.referenceNumber} — {new Date().toLocaleString('fr-FR')}
          </div>
        </div>
      </div>
    </>
  );
}
