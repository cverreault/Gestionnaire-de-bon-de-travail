import { TemplateRendererService } from './template-renderer.service';

describe('TemplateRendererService', () => {
  const svc = new TemplateRendererService();

  it('substitutes a simple {{path.to.value}}', () => {
    expect(
      svc.render('BT {{workOrder.referenceNumber}}', {
        workOrder: { referenceNumber: 'STD-1' },
      }),
    ).toBe('BT STD-1');
  });

  it('handles multiple placeholders', () => {
    expect(
      svc.render('{{a.b}} + {{c}}', { a: { b: 'X' }, c: 'Y' }),
    ).toBe('X + Y');
  });

  it('renders a missing path as an empty string', () => {
    expect(svc.render('{{no.such.key}}', {})).toBe('');
  });

  it('tolerates whitespace inside braces', () => {
    expect(svc.render('{{  a.b  }}', { a: { b: 'ok' } })).toBe('ok');
  });

  it('stringifies numbers and booleans', () => {
    expect(svc.render('{{n}}={{b}}', { n: 42, b: true })).toBe('42=true');
  });

  it('serializes objects to JSON (never crashes)', () => {
    expect(svc.render('{{o}}', { o: { hello: 'world' } })).toBe(
      '{"hello":"world"}',
    );
  });

  it('returns empty when the template is null/undefined', () => {
    expect(svc.render(null, {})).toBe('');
    expect(svc.render(undefined, {})).toBe('');
  });

  it('does NOT interpret HTML — output is plain text', () => {
    // Renderer itself doesn't escape; the caller (Email/SMS channels) is
    // responsible for the target syntax. This test just documents the
    // current contract.
    expect(svc.render('<b>{{n}}</b>', { n: 'X' })).toBe('<b>X</b>');
  });

  it('handles a path that hits a non-object mid-way', () => {
    expect(svc.render('{{a.b.c}}', { a: { b: 'not-object' } })).toBe('');
  });
});
