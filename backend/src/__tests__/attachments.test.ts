import {
  MAX_ATTACHMENT_BYTES,
  decodeBase64Size,
  stripDataUrlPrefix,
  canAccessAttachment,
} from '../lib/attachmentUtils';

/**
 * Attachment helper unit tests (Mandate P2). These are pure-function tests with
 * NO database access — they validate the decoded-size accounting used to
 * enforce the upload cap and the RBAC predicate used to gate downloads.
 */
describe('Attachment size validation', () => {
  test('decodes the true byte length of a base64 string (with padding)', () => {
    // "hello" -> "aGVsbG8=" decodes to 5 bytes.
    expect(decodeBase64Size('aGVsbG8=')).toBe(5);
    // "hi" -> "aGk=" decodes to 2 bytes.
    expect(decodeBase64Size('aGk=')).toBe(2);
  });

  test('matches Buffer.byteLength for arbitrary payloads', () => {
    const raw = Buffer.from('The quick brown fox jumps over the lazy dog.'.repeat(37));
    const b64 = raw.toString('base64');
    expect(decodeBase64Size(b64)).toBe(raw.length);
  });

  test('handles a data: URL prefix', () => {
    const raw = Buffer.from('PDFDATA');
    const dataUrl = `data:application/pdf;base64,${raw.toString('base64')}`;
    expect(decodeBase64Size(dataUrl)).toBe(raw.length);
    expect(stripDataUrlPrefix(dataUrl)).toBe(raw.toString('base64'));
  });

  test('returns 0 for empty / whitespace input', () => {
    expect(decodeBase64Size('')).toBe(0);
    expect(decodeBase64Size('   ')).toBe(0);
  });

  test('the 5MB cap is enforceable from the decoded size', () => {
    expect(MAX_ATTACHMENT_BYTES).toBe(5 * 1024 * 1024);
    // A payload that decodes to just over the cap must be rejectable.
    const overCapRaw = Buffer.alloc(MAX_ATTACHMENT_BYTES + 10, 0x41);
    const over = overCapRaw.toString('base64');
    expect(decodeBase64Size(over)).toBeGreaterThan(MAX_ATTACHMENT_BYTES);
    // A payload at the cap is accepted.
    const atCapRaw = Buffer.alloc(MAX_ATTACHMENT_BYTES, 0x41);
    expect(decodeBase64Size(atCapRaw.toString('base64'))).toBeLessThanOrEqual(MAX_ATTACHMENT_BYTES);
  });
});

describe('Attachment RBAC (owner-or-admin)', () => {
  const attachment = { ownerUserId: 'client-1' };

  test('the owning client may access their attachment', () => {
    expect(canAccessAttachment({ id: 'client-1', role: 'CLIENT' }, attachment)).toBe(true);
  });

  test('a different client may NOT access it', () => {
    expect(canAccessAttachment({ id: 'client-2', role: 'CLIENT' }, attachment)).toBe(false);
  });

  test('an admin may access any attachment', () => {
    expect(canAccessAttachment({ id: 'admin-9', role: 'ADMIN' }, attachment)).toBe(true);
  });
});
