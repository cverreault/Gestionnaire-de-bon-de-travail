import {
  renderMonthlyReportPdfHtml,
  MonthlyReportData,
} from './monthly-report-pdf.template';

const baseData: MonthlyReportData = {
  year: 2026,
  month: 6,
  totals: {
    created: 50,
    completed: 42,
    completedPositive: 35,
    completedNegative: 7,
    slaTracked: 30,
    slaBreached: 4,
  },
  resolutionTime: [
    {
      taskTypeName: 'Réparation',
      completedCount: 25,
      avgResolutionHours: 5.5,
      medianResolutionHours: 4.2,
    },
  ],
  completionOutcome: [
    { taskTypeName: 'Réparation', positive: 22, negative: 3, successRate: 0.88 },
  ],
  sla: [
    { taskTypeName: 'Réparation', tracked: 25, breached: 2, breachRate: 0.08 },
  ],
};

describe('renderMonthlyReportPdfHtml', () => {
  it('renders a valid HTML document with period and totals', () => {
    const html = renderMonthlyReportPdfHtml(baseData, 'fr');
    expect(html).toContain('<!doctype html>');
    expect(html).toContain('Rapport mensuel');
    expect(html).toContain('juin');
    expect(html).toContain('2026');
    expect(html).toContain('>50<');
    expect(html).toContain('>42<');
  });

  it('computes the success rate from positive vs negative', () => {
    const html = renderMonthlyReportPdfHtml(baseData, 'fr');
    expect(html).toContain('83 %');
  });

  it('computes the SLA breach rate from tracked vs breached', () => {
    const html = renderMonthlyReportPdfHtml(baseData, 'fr');
    expect(html).toContain('13 %');
  });

  it('shows em dashes when no data is available for a metric', () => {
    const html = renderMonthlyReportPdfHtml(
      {
        ...baseData,
        totals: { ...baseData.totals, slaTracked: 0, slaBreached: 0 },
      },
      'fr',
    );
    expect(html.match(/—/g)?.length ?? 0).toBeGreaterThan(0);
  });

  it('renders English strings when locale=en', () => {
    const html = renderMonthlyReportPdfHtml(baseData, 'en');
    expect(html).toContain('Monthly report');
    expect(html).toContain('June');
    expect(html).not.toContain('Rapport mensuel');
  });

  it('renders an empty-state row when a section has no data', () => {
    const html = renderMonthlyReportPdfHtml(
      { ...baseData, resolutionTime: [], completionOutcome: [], sla: [] },
      'fr',
    );
    expect(html.match(/Aucune donnée/g)?.length ?? 0).toBe(3);
  });

  it('escapes user-supplied task-type names', () => {
    const html = renderMonthlyReportPdfHtml(
      {
        ...baseData,
        resolutionTime: [
          {
            taskTypeName: '<script>x</script>',
            completedCount: 1,
            avgResolutionHours: 1,
            medianResolutionHours: 1,
          },
        ],
      },
      'fr',
    );
    expect(html).not.toContain('<script>x</script>');
    expect(html).toContain('&lt;script&gt;x&lt;/script&gt;');
  });
});
