/**
 * HTML template for the per-work-order PDF (fiche d'intervention).
 *
 * Plain tagged template literal — no Handlebars / EJS dependency.
 * `esc()` is applied on every interpolation site to keep the output
 * safe even though the data comes from our own DB. Defensive habit:
 * a notes field with a stray `</style>` shouldn't break the layout.
 */

export interface WorkOrderPdfData {
  referenceNumber: string;
  title: string;
  description: string | null;
  status: string;
  currentStepLabel: string | null;
  taskTypeLabel: string | null;
  createdAt: Date;
  slaTargetAt: Date | null;
  slaBreachedAt: Date | null;
  completionNotes: string | null;
  negativeReason: string | null;
  signatureClient?: string | null;
  signatureTechnician?: string | null;
  signedAt?: Date | null;
  client: {
    name: string;
    email: string | null;
    phone: string | null;
  } | null;
  address: {
    street: string | null;
    city: string | null;
    postalCode: string | null;
  } | null;
  assignedTo: {
    firstName: string;
    lastName: string;
    email: string | null;
    phone: string | null;
  } | null;
  notes: Array<{
    body: string;
    authorName: string;
    createdAt: Date;
  }>;
  attachments: Array<{
    filename: string;
    uploadedAt: Date;
  }>;
}

interface TemplateStrings {
  workOrder: string;
  reference: string;
  taskType: string;
  status: string;
  step: string;
  createdOn: string;
  slaTarget: string;
  slaBreached: string;
  client: string;
  address: string;
  assignedTo: string;
  description: string;
  notes: string;
  attachments: string;
  completionNotes: string;
  negativeReason: string;
  signatures: string;
  signatureClient: string;
  signatureTechnician: string;
  signedAt: string;
  noSignature: string;
  noClient: string;
  noAddress: string;
  noAssignee: string;
  generated: string;
}

const STRINGS: Record<'fr' | 'en', TemplateStrings> = {
  fr: {
    workOrder: 'Bon de travail',
    reference: 'Référence',
    taskType: 'Type',
    status: 'Statut',
    step: 'Étape courante',
    createdOn: 'Créé le',
    slaTarget: 'Délai SLA',
    slaBreached: 'SLA dépassé',
    client: 'Client',
    address: 'Adresse',
    assignedTo: 'Assigné à',
    description: 'Description',
    notes: 'Notes',
    attachments: 'Pièces jointes',
    completionNotes: 'Notes de complétion',
    negativeReason: 'Motif de fermeture négative',
    noClient: 'Aucun client',
    noAddress: 'Aucune adresse',
    noAssignee: 'Non assigné',
    signatures: 'Signatures',
    signatureClient: 'Signature du client',
    signatureTechnician: 'Signature du technicien',
    signedAt: 'Signé le',
    noSignature: 'Non signé',
    generated: 'Document généré le',
  },
  en: {
    workOrder: 'Work order',
    reference: 'Reference',
    taskType: 'Type',
    status: 'Status',
    step: 'Current step',
    createdOn: 'Created on',
    slaTarget: 'SLA target',
    slaBreached: 'SLA breached',
    client: 'Client',
    address: 'Address',
    assignedTo: 'Assigned to',
    description: 'Description',
    notes: 'Notes',
    attachments: 'Attachments',
    completionNotes: 'Completion notes',
    negativeReason: 'Negative completion reason',
    noClient: 'No client',
    noAddress: 'No address',
    noAssignee: 'Unassigned',
    signatures: 'Signatures',
    signatureClient: 'Client signature',
    signatureTechnician: 'Technician signature',
    signedAt: 'Signed on',
    noSignature: 'Unsigned',
    generated: 'Document generated on',
  },
};

function esc(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function fmtDate(d: Date, locale: 'fr' | 'en'): string {
  return new Intl.DateTimeFormat(locale === 'fr' ? 'fr-CA' : 'en-CA', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(d);
}

export function renderWorkOrderPdfHtml(
  data: WorkOrderPdfData,
  locale: 'fr' | 'en' = 'fr',
): string {
  const t = STRINGS[locale];
  const client = data.client
    ? `<strong>${esc(data.client.name)}</strong>` +
      (data.client.email ? `<br/>${esc(data.client.email)}` : '') +
      (data.client.phone ? `<br/>${esc(data.client.phone)}` : '')
    : `<em>${esc(t.noClient)}</em>`;

  const address = data.address
    ? [data.address.street, data.address.city, data.address.postalCode]
        .filter(Boolean)
        .map((p) => esc(p))
        .join(', ')
    : `<em>${esc(t.noAddress)}</em>`;

  const assignee = data.assignedTo
    ? `<strong>${esc(data.assignedTo.firstName)} ${esc(data.assignedTo.lastName)}</strong>` +
      (data.assignedTo.email ? `<br/>${esc(data.assignedTo.email)}` : '') +
      (data.assignedTo.phone ? `<br/>${esc(data.assignedTo.phone)}` : '')
    : `<em>${esc(t.noAssignee)}</em>`;

  const notesHtml = data.notes.length
    ? `<ul class="notes">${data.notes
        .map(
          (n) =>
            `<li><div class="meta">${esc(n.authorName)} — ${esc(fmtDate(n.createdAt, locale))}</div><div>${esc(n.body)}</div></li>`,
        )
        .join('')}</ul>`
    : `<p class="muted">—</p>`;

  const attachmentsHtml = data.attachments.length
    ? `<ul>${data.attachments
        .map((a) => `<li>${esc(a.filename)} <span class="muted">(${esc(fmtDate(a.uploadedAt, locale))})</span></li>`)
        .join('')}</ul>`
    : `<p class="muted">—</p>`;

  const slaBlock = data.slaBreachedAt
    ? `<tr><th>${esc(t.slaBreached)}</th><td class="breach">${esc(fmtDate(data.slaBreachedAt, locale))}</td></tr>`
    : data.slaTargetAt
      ? `<tr><th>${esc(t.slaTarget)}</th><td>${esc(fmtDate(data.slaTargetAt, locale))}</td></tr>`
      : '';

  const closeBlock = data.completionNotes
    ? `<section><h2>${esc(t.completionNotes)}</h2><p>${esc(data.completionNotes)}</p></section>`
    : '';
  const negativeBlock = data.negativeReason
    ? `<section><h2>${esc(t.negativeReason)}</h2><p>${esc(data.negativeReason)}</p></section>`
    : '';

  // Signatures — render as inline PNGs (data URLs from the DB). If neither
  // is present, skip the block entirely.
  const signaturesBlock =
    data.signatureClient || data.signatureTechnician
      ? `<section class="signatures">
    <h2>${esc(t.signatures)}</h2>
    ${data.signedAt ? `<p class="muted" style="margin:0 0 8px">${esc(t.signedAt)} ${esc(fmtDate(data.signedAt, locale))}</p>` : ''}
    <div class="sig-grid">
      <div class="sig-cell">
        <div class="sig-label">${esc(t.signatureTechnician)}</div>
        ${data.signatureTechnician
          ? `<img alt="signature technicien" src="${esc(data.signatureTechnician)}" />`
          : `<div class="sig-empty">${esc(t.noSignature)}</div>`}
      </div>
      <div class="sig-cell">
        <div class="sig-label">${esc(t.signatureClient)}</div>
        ${data.signatureClient
          ? `<img alt="signature client" src="${esc(data.signatureClient)}" />`
          : `<div class="sig-empty">${esc(t.noSignature)}</div>`}
      </div>
    </div>
  </section>`
      : '';

  return `<!doctype html>
<html lang="${esc(locale)}">
<head>
<meta charset="utf-8" />
<title>${esc(t.workOrder)} ${esc(data.referenceNumber)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", "Noto Sans", sans-serif; color: #1f2937; margin: 0; padding: 0; font-size: 11pt; line-height: 1.45; }
  header { border-bottom: 3px solid #2563eb; padding-bottom: 12px; margin-bottom: 18px; }
  h1 { font-size: 20pt; color: #111827; margin: 0 0 4px; }
  .ref { color: #6b7280; font-size: 11pt; font-weight: 600; letter-spacing: 0.04em; }
  h2 { color: #2563eb; font-size: 13pt; margin: 20px 0 8px; padding-bottom: 4px; border-bottom: 1px solid #e5e7eb; }
  table.meta { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
  table.meta th { text-align: left; width: 30%; padding: 4px 8px 4px 0; vertical-align: top; color: #6b7280; font-weight: 600; }
  table.meta td { padding: 4px 0; vertical-align: top; }
  .grid { display: flex; gap: 24px; }
  .grid section { flex: 1; }
  .muted { color: #9ca3af; font-style: italic; }
  .breach { color: #dc2626; font-weight: 700; }
  ul.notes { padding-left: 0; list-style: none; }
  ul.notes li { border-left: 3px solid #2563eb; padding-left: 10px; margin-bottom: 10px; }
  ul.notes .meta { color: #6b7280; font-size: 9pt; margin-bottom: 4px; }
  footer { margin-top: 32px; padding-top: 8px; border-top: 1px solid #e5e7eb; color: #9ca3af; font-size: 8pt; text-align: center; }
  .signatures { page-break-inside: avoid; margin-top: 20px; }
  .sig-grid { display: flex; gap: 24px; margin-top: 8px; }
  .sig-cell { flex: 1; border: 1px solid #d1d5db; border-radius: 6px; padding: 10px; background: #fafafa; min-height: 120px; }
  .sig-label { font-size: 9pt; color: #6b7280; margin-bottom: 6px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; }
  .sig-cell img { max-width: 100%; max-height: 100px; display: block; margin: 4px auto; }
  .sig-empty { color: #9ca3af; font-style: italic; text-align: center; padding: 30px 0; font-size: 10pt; }
</style>
</head>
<body>
<header>
  <div class="ref">${esc(t.workOrder)} · ${esc(data.referenceNumber)}</div>
  <h1>${esc(data.title)}</h1>
</header>

<table class="meta">
  <tr><th>${esc(t.taskType)}</th><td>${esc(data.taskTypeLabel ?? '—')}</td></tr>
  <tr><th>${esc(t.status)}</th><td>${esc(data.status)}</td></tr>
  <tr><th>${esc(t.step)}</th><td>${esc(data.currentStepLabel ?? '—')}</td></tr>
  <tr><th>${esc(t.createdOn)}</th><td>${esc(fmtDate(data.createdAt, locale))}</td></tr>
  ${slaBlock}
</table>

<div class="grid">
  <section>
    <h2>${esc(t.client)}</h2>
    <p>${client}</p>
    <h2>${esc(t.address)}</h2>
    <p>${address}</p>
  </section>
  <section>
    <h2>${esc(t.assignedTo)}</h2>
    <p>${assignee}</p>
  </section>
</div>

${data.description ? `<section><h2>${esc(t.description)}</h2><p>${esc(data.description)}</p></section>` : ''}

<section>
  <h2>${esc(t.notes)}</h2>
  ${notesHtml}
</section>

<section>
  <h2>${esc(t.attachments)}</h2>
  ${attachmentsHtml}
</section>

${closeBlock}
${negativeBlock}
${signaturesBlock}

<footer>${esc(t.generated)} ${esc(fmtDate(new Date(), locale))}</footer>
</body>
</html>`;
}
