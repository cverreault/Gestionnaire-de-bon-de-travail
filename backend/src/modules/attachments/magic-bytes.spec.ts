import { magicBytesMatch } from './magic-bytes';

const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00]);
const pdf = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d]);
const zip = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00]);
const html = Buffer.from('<!DOCTYPE html><script>alert(1)</script>');
const webp = Buffer.concat([
  Buffer.from([0x52, 0x49, 0x46, 0x46]),
  Buffer.from([0x00, 0x00, 0x00, 0x00]),
  Buffer.from([0x57, 0x45, 0x42, 0x50]),
]);
const riffWav = Buffer.concat([
  Buffer.from([0x52, 0x49, 0x46, 0x46]),
  Buffer.from([0x00, 0x00, 0x00, 0x00]),
  Buffer.from([0x57, 0x41, 0x56, 0x45]),
]);

describe('magicBytesMatch (B27)', () => {
  it('accepts a real PNG / JPEG / PDF / OOXML declared as such', () => {
    expect(magicBytesMatch(png, 'image/png')).toBe(true);
    expect(magicBytesMatch(jpeg, 'image/jpeg')).toBe(true);
    expect(magicBytesMatch(pdf, 'application/pdf')).toBe(true);
    expect(
      magicBytesMatch(
        zip,
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ),
    ).toBe(true);
  });

  it('rejects an HTML payload mislabelled as image/png', () => {
    expect(magicBytesMatch(html, 'image/png')).toBe(false);
  });

  it('rejects a PNG mislabelled as PDF', () => {
    expect(magicBytesMatch(png, 'application/pdf')).toBe(false);
  });

  it('validates the WEBP fourcc, not just RIFF', () => {
    expect(magicBytesMatch(webp, 'image/webp')).toBe(true);
    expect(magicBytesMatch(riffWav, 'image/webp')).toBe(false); // RIFF but WAVE
  });

  it('passes through a MIME with no known signature', () => {
    expect(magicBytesMatch(html, 'text/plain')).toBe(true);
  });
});
