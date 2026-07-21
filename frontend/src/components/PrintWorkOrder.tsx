import type { WorkOrder, TemplateSection, TemplateField, WorkOrderTemplate } from '../types';
import { WorkOrderStatus, WorkOrderType } from '../types';
import { useTranslation } from 'react-i18next';

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
  const { t } = useTranslation('workOrders');

  const STATUS_LABELS: Record<WorkOrderStatus, string> = {
    [WorkOrderStatus.REQUESTED]: t('workOrders:print.statusRequested', { defaultValue: 'Demandé' }),
    [WorkOrderStatus.CREATED]: t('workOrders:print.statusCreated', { defaultValue: 'Créé' }),
    [WorkOrderStatus.ASSIGNED]: t('workOrders:print.statusAssigned', { defaultValue: 'Assigné' }),
    [WorkOrderStatus.DISPATCHED]: t('workOrders:print.statusDispatched', { defaultValue: 'Réparti' }),
    [WorkOrderStatus.EN_ROUTE]: t('workOrders:print.statusEnRoute', { defaultValue: 'En route' }),
    [WorkOrderStatus.IN_PROGRESS]: t('workOrders:print.statusInProgress', { defaultValue: 'En cours' }),
    [WorkOrderStatus.COMPLETED_POSITIVE]: t('workOrders:print.statusCompletedPositive', { defaultValue: 'Terminé (positif)' }),
    [WorkOrderStatus.COMPLETED_NEGATIVE]: t('workOrders:print.statusCompletedNegative', { defaultValue: 'Terminé (négatif)' }),
  };

  const TYPE_LABELS_PRINT: Record<WorkOrderType, string> = {
    [WorkOrderType.INSTALLATION]: t('workOrders:print.typeInstallation', { defaultValue: 'Installation' }),
    [WorkOrderType.REPAIR]: t('workOrders:print.typeRepair', { defaultValue: 'Réparation' }),
    [WorkOrderType.MAINTENANCE]: t('workOrders:print.typeMaintenance', { defaultValue: 'Maintenance' }),
    [WorkOrderType.INSPECTION]: t('workOrders:print.typeInspection', { defaultValue: 'Inspection' }),
    [WorkOrderType.OTHER]: t('workOrders:print.typeOther', { defaultValue: 'Autre' }),
  };

  // Build client display strings. Resolution priority matches the screen view:
  //   1) V3 Client + ClientAddress relations (modern flow)
  //   2) Temporary client (in-form one-off)
  //   3) External client name + free-text address (legacy)
  let clientName = '—';
  let clientPhone = '—';
  let clientAddress = '—';

  if (wo.client) {
    const c = wo.client;
    clientName = `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim() || '—';
    clientPhone = c.phone ?? '—';
    if (wo.clientAddress_rel) {
      const a = wo.clientAddress_rel;
      const parts = [a.street, a.city, a.postalCode].filter(Boolean);
      clientAddress = parts.length > 0 ? parts.join(', ') : '—';
    } else if (wo.clientAddress) {
      clientAddress = wo.clientAddress;
    }
  } else if (wo.temporaryClient) {
    const tc = wo.temporaryClient;
    clientName = `${tc.firstName} ${tc.lastName}`;
    clientPhone = tc.phone ?? '—';
    const addrParts = [tc.address, tc.city, tc.postalCode].filter(Boolean);
    clientAddress = addrParts.length > 0 ? addrParts.join(', ') : '—';
  } else if (wo.externalClientName) {
    clientName = wo.externalClientName;
    clientAddress = wo.clientAddress ?? '—';
  }

  // Completion data — only render if the BT actually has any.
  const isCompleted =
    wo.status === WorkOrderStatus.COMPLETED_POSITIVE ||
    wo.status === WorkOrderStatus.COMPLETED_NEGATIVE;
  const hasCompletionData =
    isCompleted ||
    !!wo.completionNotes ||
    !!wo.actualStartTime ||
    !!wo.actualEndTime;

  // Template + filled values — task types can carry a custom form whose
  // section/field structure lives on taskType.template and the answers
  // on wo.templateData (JSONB, typed-loosely at the API edge). The detail
  // include() ships the full sections/fields tree, but TaskType.template
  // is typed as the lightweight {id, name} projection on the screen-facing
  // type. Assert to the full WorkOrderTemplate here.
  const template = wo.taskType?.template as WorkOrderTemplate | undefined;
  const templateData =
    (wo as { templateData?: Record<string, unknown> | null }).templateData ?? null;
  const hasTemplateValues =
    !!template &&
    Array.isArray(template.sections) &&
    !!templateData &&
    Object.keys(templateData).length > 0;

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
              <span style={{ fontSize: '7.5pt', color: '#555', marginLeft: '6pt' }}>{t('workOrders:print.appTagline', { defaultValue: 'Gestion des bons de travail' })}</span>
            </div>
            <div style={{ textAlign: 'right' }}>
              <span style={{ fontWeight: 700, fontSize: '10pt', letterSpacing: '0.06em' }}>
                {t('workOrders:print.docTitle', { defaultValue: 'BON DE TRAVAIL' })}
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
              <span style={labelPrint}>{t('workOrders:print.reference', { defaultValue: 'Référence' })}</span>
              <span style={{ ...valuePrint, fontFamily: 'monospace', fontWeight: 700 }}>
                {wo.referenceNumber}
              </span>
            </div>
            <div style={field}>
              <span style={labelPrint}>{t('workOrders:print.creationDate', { defaultValue: 'Date de création' })}</span>
              <span style={valuePrint}>{fmtDate(wo.createdAt)}</span>
            </div>
            <div style={field}>
              <span style={labelPrint}>{t('workOrders:print.status', { defaultValue: 'Statut' })}</span>
              <span style={{ ...valuePrint, fontWeight: 700 }}>{STATUS_LABELS[wo.status]}</span>
            </div>
            <div style={field}>
              <span style={labelPrint}>{t('workOrders:print.priority', { defaultValue: 'Priorité' })}</span>
              <span style={valuePrint}>{wo.priority} / 5</span>
            </div>
          </div>

          <div style={row}>
            <div style={field}>
              <span style={labelPrint}>{t('workOrders:print.type', { defaultValue: 'Type' })}</span>
              <span style={valuePrint}>{TYPE_LABELS_PRINT[wo.type]}</span>
            </div>
            <div style={{ flex: 3, minWidth: '120pt' }}>
              <span style={labelPrint}>{t('workOrders:print.titleLabel', { defaultValue: 'Titre' })}</span>
              <span style={{ ...valuePrint, fontWeight: 600 }}>{wo.title}</span>
            </div>
          </div>

          {/* ── Description ─────────────────────────────────────────────────── */}
          <div style={sectionTitle}>{t('workOrders:print.description', { defaultValue: 'Description' })}</div>
          <div style={{ whiteSpace: 'pre-wrap', marginBottom: '1pt', fontSize: '8pt', maxHeight: '44pt', overflow: 'hidden' }}>
            {wo.description ?? '—'}
          </div>

          {/* ── Template values (custom form answers) ───────────────────── */}
          {hasTemplateValues && (
            <>
              <hr style={hr} />
              <div style={sectionTitle}>{t('workOrders:print.formDetails', { defaultValue: 'Détails du formulaire' })}</div>
              {template!.sections.map((section: TemplateSection) => {
                const fieldsWithValues = section.fields
                  .map((f: TemplateField) => ({
                    field: f,
                    value: (templateData as Record<string, unknown>)[f.id],
                  }))
                  .filter(
                    ({ value }: { value: unknown }) =>
                      value !== undefined && value !== '' && value !== null,
                  );
                if (fieldsWithValues.length === 0) return null;
                return (
                  <div key={section.id} style={{ marginBottom: '3pt' }}>
                    <div style={{
                      fontSize: '7.5pt',
                      fontWeight: 700,
                      color: '#444',
                      marginBottom: '1pt',
                    }}>
                      {section.name}
                    </div>
                    <div style={row}>
                      {fieldsWithValues.map(
                        ({ field: f, value }: { field: TemplateField; value: unknown }) => (
                          <div key={f.id} style={field}>
                            <span style={labelPrint}>{f.label}</span>
                            <span style={valuePrint}>
                              {Array.isArray(value)
                                ? value.map(String).join(', ')
                                : typeof value === 'boolean'
                                  ? value ? t('workOrders:print.yes', { defaultValue: '✓ Oui' }) : t('workOrders:print.no', { defaultValue: '✗ Non' })
                                  : String(value)}
                            </span>
                          </div>
                        ),
                      )}
                    </div>
                  </div>
                );
              })}
            </>
          )}

          <hr style={hr} />

          {/* ── Client + Technicien (côte à côte) ─────────────────────────── */}
          <div style={{ display: 'flex', gap: '12pt' }}>
            <div style={{ flex: 1 }}>
              <div style={sectionTitle}>{t('workOrders:print.client', { defaultValue: 'Client' })}</div>
              <div style={row}>
                <div style={field}>
                  <span style={labelPrint}>{t('workOrders:print.name', { defaultValue: 'Nom' })}</span>
                  <span style={valuePrint}>{clientName}</span>
                </div>
                <div style={field}>
                  <span style={labelPrint}>{t('workOrders:print.phone', { defaultValue: 'Téléphone' })}</span>
                  <span style={valuePrint}>{clientPhone}</span>
                </div>
              </div>
              <div>
                <span style={labelPrint}>{t('workOrders:print.address', { defaultValue: 'Adresse' })}</span>
                <span style={valuePrint}>{clientAddress}</span>
              </div>
            </div>

            <div style={{ flex: 1 }}>
              <div style={sectionTitle}>{t('workOrders:print.assignedTechnician', { defaultValue: 'Technicien assigné' })}</div>
              <div style={row}>
                <div style={field}>
                  <span style={labelPrint}>{t('workOrders:print.name', { defaultValue: 'Nom' })}</span>
                  <span style={valuePrint}>{techName}</span>
                </div>
                {techPhone && (
                  <div style={field}>
                    <span style={labelPrint}>{t('workOrders:print.phoneShort', { defaultValue: 'Tél.' })}</span>
                    <span style={valuePrint}>{techPhone}</span>
                  </div>
                )}
              </div>
              <div style={row}>
                <div style={field}>
                  <span style={labelPrint}>{t('workOrders:print.scheduledDate', { defaultValue: 'Date planifiée' })}</span>
                  <span style={valuePrint}>{fmtDate(wo.scheduledDate)}</span>
                </div>
                <div style={field}>
                  <span style={labelPrint}>{t('workOrders:print.time', { defaultValue: 'Heure' })}</span>
                  <span style={valuePrint}>{schedWindow}</span>
                </div>
              </div>
            </div>
          </div>

          <hr style={hr} />

          {/* ── Notes ───────────────────────────────────────────────────────── */}
          <div style={sectionTitle}>{t('workOrders:print.notes', { defaultValue: 'Notes' })}</div>
          {!wo.notes || wo.notes.length === 0 ? (
            <div style={{ color: '#555', fontSize: '8pt', marginBottom: '1pt' }}>{t('workOrders:print.noNote', { defaultValue: 'Aucune note' })}</div>
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
                  {t('workOrders:print.moreNotes', { defaultValue: '... et {{count}} autres notes', count: wo.notes.length - 5 })}
                </div>
              )}
            </div>
          )}

          {/* Negative reason if applicable */}
          {wo.negativeReason && (
            <div style={{ marginBottom: '1pt' }}>
              <span style={labelPrint}>{t('workOrders:print.negativeReason', { defaultValue: 'Raison de la clôture négative' })}</span>
              <span style={{ ...valuePrint, fontSize: '8.5pt' }}>{wo.negativeReason}</span>
            </div>
          )}

          {/* ── Completion (rendered when the BT has any real-world timing) ─── */}
          {hasCompletionData && (
            <>
              <hr style={hr} />
              <div style={sectionTitle}>{t('workOrders:print.completion', { defaultValue: 'Complétion' })}</div>
              <div style={row}>
                <div style={field}>
                  <span style={labelPrint}>{t('workOrders:print.actualStart', { defaultValue: 'Début effectif' })}</span>
                  <span style={valuePrint}>
                    {wo.actualStartTime
                      ? `${fmtDate(wo.actualStartTime)} ${fmtTime(wo.actualStartTime)}`
                      : '—'}
                  </span>
                </div>
                <div style={field}>
                  <span style={labelPrint}>{t('workOrders:print.actualEnd', { defaultValue: 'Fin effective' })}</span>
                  <span style={valuePrint}>
                    {wo.actualEndTime
                      ? `${fmtDate(wo.actualEndTime)} ${fmtTime(wo.actualEndTime)}`
                      : '—'}
                  </span>
                </div>
                <div style={field}>
                  <span style={labelPrint}>{t('workOrders:print.result', { defaultValue: 'Résultat' })}</span>
                  <span style={{ ...valuePrint, fontWeight: 700 }}>
                    {wo.status === WorkOrderStatus.COMPLETED_POSITIVE
                      ? t('workOrders:print.resultPositive', { defaultValue: 'Positif' })
                      : wo.status === WorkOrderStatus.COMPLETED_NEGATIVE
                        ? t('workOrders:print.resultNegative', { defaultValue: 'Négatif' })
                        : t('workOrders:print.resultInProgress', { defaultValue: 'En cours' })}
                  </span>
                </div>
              </div>
              {wo.completionNotes && (
                <div style={{ marginTop: '1pt' }}>
                  <span style={labelPrint}>{t('workOrders:print.completionNotes', { defaultValue: 'Notes de complétion' })}</span>
                  <span style={{ ...valuePrint, whiteSpace: 'pre-wrap' }}>
                    {wo.completionNotes}
                  </span>
                </div>
              )}
            </>
          )}

          <hr style={hr} />

          {/* ── Zone terrain + Signatures (côte à côte) ─────────────────── */}
          <div style={{ display: 'flex', gap: '12pt' }}>
            <div style={{ flex: 3 }}>
              <div style={sectionTitle}>{t('workOrders:print.fieldZone', { defaultValue: 'Zone terrain — à remplir par le technicien' })}</div>
              <div style={{ marginBottom: '2pt' }}>
                <span style={labelPrint}>{t('workOrders:print.workPerformed', { defaultValue: 'Travaux effectués' })}</span>
                <span style={blankLine} />
                <span style={blankLine} />
              </div>
              <div style={{ marginBottom: '2pt' }}>
                <span style={labelPrint}>{t('workOrders:print.result', { defaultValue: 'Résultat' })}</span>
                <div style={checkboxRow}>
                  <span>{t('workOrders:print.checkPositive', { defaultValue: '☐ Positif' })}</span>
                  <span>{t('workOrders:print.checkNegative', { defaultValue: '☐ Négatif' })}</span>
                </div>
              </div>
              <div>
                <span style={labelPrint}>{t('workOrders:print.comments', { defaultValue: 'Commentaires' })}</span>
                <span style={blankLine} />
              </div>
            </div>

            <div style={{ flex: 2 }}>
              <div style={sectionTitle}>{t('workOrders:print.signatures', { defaultValue: 'Signatures' })}</div>
              <div style={{ marginBottom: '6pt' }}>
                <span style={{ ...labelPrint, marginBottom: '1pt' }}>{t('workOrders:print.technician', { defaultValue: 'Technicien' })}</span>
                <div style={{ borderBottom: '1px solid #000', height: '20pt', marginBottom: '2pt' }} />
                <div style={{ display: 'flex', gap: '4pt' }}>
                  <span style={{ fontSize: '7pt' }}>{t('workOrders:print.date', { defaultValue: 'Date' })}</span>
                  <span style={{ flex: 1, borderBottom: '1px solid #555', display: 'inline-block' }} />
                </div>
              </div>
              <div>
                <span style={{ ...labelPrint, marginBottom: '1pt' }}>{t('workOrders:print.client', { defaultValue: 'Client' })}</span>
                <div style={{ borderBottom: '1px solid #000', height: '20pt', marginBottom: '2pt' }} />
                <div style={{ display: 'flex', gap: '4pt' }}>
                  <span style={{ fontSize: '7pt' }}>{t('workOrders:print.date', { defaultValue: 'Date' })}</span>
                  <span style={{ flex: 1, borderBottom: '1px solid #555', display: 'inline-block' }} />
                </div>
              </div>
            </div>
          </div>

          {/* ── Footer ──────────────────────────────────────────────────────── */}
          <hr style={{ ...hr, marginTop: '4pt' }} />
          <div style={{ fontSize: '6.5pt', color: '#888', textAlign: 'center' }}>
            {t('workOrders:print.footer', { defaultValue: 'TaskMgr — Réf. {{ref}} — {{date}}', ref: wo.referenceNumber, date: new Date().toLocaleString('fr-FR') })}
          </div>
        </div>
      </div>
    </>
  );
}
