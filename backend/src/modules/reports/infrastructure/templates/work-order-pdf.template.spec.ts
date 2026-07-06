import { renderWorkOrderPdfHtml, WorkOrderPdfData } from './work-order-pdf.template';

const baseData: WorkOrderPdfData = {
  referenceNumber: 'STD-20260101-0001',
  title: 'Réparation chauffe-eau',
  description: 'Le chauffe-eau fuit au niveau du tuyau d\'évacuation.',
  status: 'IN_PROGRESS',
  currentStepLabel: 'Sur place',
  taskTypeLabel: 'Réparation',
  createdAt: new Date('2026-01-15T14:30:00Z'),
  slaTargetAt: new Date('2026-01-15T18:30:00Z'),
  slaBreachedAt: null,
  completionNotes: null,
  negativeReason: null,
  client: {
    name: 'Acme Inc. (Jean Dupont)',
    email: 'jean@acme.com',
    phone: '514-555-0100',
  },
  address: {
    street: '123 rue Saint-Denis',
    city: 'Montréal',
    postalCode: 'H2X 1L1',
  },
  assignedTo: {
    firstName: 'Marie',
    lastName: 'Tremblay',
    email: 'marie@taskmgr.test',
    phone: '514-555-0200',
  },
  notes: [
    {
      body: 'Appelé le client pour confirmer le RDV.',
      authorName: 'Marie Tremblay',
      createdAt: new Date('2026-01-15T15:00:00Z'),
    },
  ],
  attachments: [
    { filename: 'photo-fuite.jpg', uploadedAt: new Date('2026-01-15T15:30:00Z') },
  ],
  partsUsed: [],
};

describe('renderWorkOrderPdfHtml', () => {
  it('produces a self-contained HTML doc with the work order reference', () => {
    const html = renderWorkOrderPdfHtml(baseData, 'fr');
    expect(html).toContain('<!doctype html>');
    expect(html).toContain('STD-20260101-0001');
    expect(html).toContain('Réparation chauffe-eau');
    expect(html).toContain('Acme Inc. (Jean Dupont)');
    expect(html).toContain('Marie Tremblay');
    expect(html).toContain('photo-fuite.jpg');
  });

  it('escapes HTML special characters in user-supplied fields', () => {
    const html = renderWorkOrderPdfHtml(
      {
        ...baseData,
        title: '<script>alert("xss")</script>',
        notes: [
          {
            body: 'Note avec </style><img src=x>',
            authorName: 'Tech "1" & Co',
            createdAt: new Date('2026-01-15T16:00:00Z'),
          },
        ],
      },
      'fr',
    );
    expect(html).not.toContain('<script>alert');
    expect(html).toContain('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
    expect(html).toContain('&lt;/style&gt;&lt;img src=x&gt;');
    expect(html).toContain('Tech &quot;1&quot; &amp; Co');
  });

  it('renders the SLA-breached row in red when slaBreachedAt is set', () => {
    const html = renderWorkOrderPdfHtml(
      { ...baseData, slaBreachedAt: new Date('2026-01-15T20:00:00Z') },
      'fr',
    );
    expect(html).toContain('SLA dépassé');
    expect(html).toMatch(/<td class="breach">/);
  });

  it('renders English strings when locale=en', () => {
    const html = renderWorkOrderPdfHtml(baseData, 'en');
    expect(html).toContain('Work order');
    expect(html).toContain('SLA target');
    expect(html).toContain('Assigned to');
    expect(html).not.toContain('Bon de travail');
  });

  it('renders the parts-used table (B24) with localized names and no prices', () => {
    const html = renderWorkOrderPdfHtml(
      {
        ...baseData,
        partsUsed: [{ name: 'Câble RG6 30m', quantity: 2, unit: 'un' }],
      },
      'fr',
    );
    expect(html).toContain('Pièces utilisées');
    expect(html).toContain('Câble RG6 30m');
    expect(html).toContain('Qté');
    expect(html).not.toContain('24.99'); // prices stay internal until invoicing
  });

  it('omits the parts-used section entirely when empty', () => {
    const html = renderWorkOrderPdfHtml(baseData, 'fr');
    expect(html).not.toContain('Pièces utilisées');
  });

  it('shows muted placeholders when client / address / assignee are missing', () => {
    const html = renderWorkOrderPdfHtml(
      {
        ...baseData,
        client: null,
        address: null,
        assignedTo: null,
        notes: [],
        attachments: [],
      },
      'fr',
    );
    expect(html).toContain('Aucun client');
    expect(html).toContain('Aucune adresse');
    expect(html).toContain('Non assigné');
  });

  it('omits the completion / negative-reason sections when both are empty', () => {
    const html = renderWorkOrderPdfHtml(baseData, 'fr');
    expect(html).not.toContain('Notes de complétion');
    expect(html).not.toContain('Motif de fermeture négative');
  });

  it('renders the completion-notes section when present', () => {
    const html = renderWorkOrderPdfHtml(
      { ...baseData, completionNotes: 'Tout fonctionne.' },
      'fr',
    );
    expect(html).toContain('Notes de complétion');
    expect(html).toContain('Tout fonctionne.');
  });
});
