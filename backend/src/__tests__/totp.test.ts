/**
 * Proves the SMTP-free TOTP second factor is correct by checking it against the
 * official RFC 6238 Appendix B test vectors (SHA-1, seed "12345678901234567890"),
 * truncated to 6 digits. This runs fully offline — no email, no network, no DB.
 */

import { base32Encode, base32Decode, generateTotpSecret, totp, verifyTotp, otpauthUri } from '../lib/totp';

// RFC 6238 SHA-1 seed is the ASCII "12345678901234567890" (20 bytes).
const SEED = base32Encode(Buffer.from('12345678901234567890', 'ascii'));

// [unix time seconds, expected 8-digit code] from RFC 6238 Appendix B.
const VECTORS: Array<[number, string]> = [
  [59, '94287082'],
  [1111111109, '07081804'],
  [1111111111, '14050471'],
  [1234567890, '89005924'],
  [2000000000, '69279037'],
  [20000000000, '65353130'],
];

describe('TOTP — RFC 6238 test vectors', () => {
  it('base32 round-trips', () => {
    expect(base32Decode(base32Encode(Buffer.from('hello world'))).toString()).toBe('hello world');
  });

  it('matches the RFC vectors (last 6 digits)', () => {
    for (const [seconds, code8] of VECTORS) {
      const expected6 = code8.slice(-6);
      expect(totp(SEED, { time: seconds * 1000, digits: 6 })).toBe(expected6);
    }
  });

  it('verifies the current code and rejects a wrong one', () => {
    const secret = generateTotpSecret();
    const now = Date.now();
    const code = totp(secret, { time: now });
    expect(verifyTotp(code, secret, { time: now })).toBe(true);
    expect(verifyTotp('000000', secret, { time: now })).toBe(false);
    expect(verifyTotp('12345', secret, { time: now })).toBe(false); // wrong length
  });

  it('accepts codes within the ±1 step drift window but not far off', () => {
    const secret = generateTotpSecret();
    const now = Date.now();
    const prevStep = totp(secret, { time: now - 30_000 });
    const wayOff = totp(secret, { time: now - 5 * 60_000 });
    expect(verifyTotp(prevStep, secret, { time: now, window: 1 })).toBe(true);
    expect(verifyTotp(wayOff, secret, { time: now, window: 1 })).toBe(false);
  });

  it('builds a valid otpauth URI for authenticator apps', () => {
    const uri = otpauthUri('JBSWY3DPEHPK3PXP', 'client@example.com', 'TransformBiz');
    expect(uri).toMatch(/^otpauth:\/\/totp\/TransformBiz%3Aclient%40example.com\?/);
    expect(uri).toContain('secret=JBSWY3DPEHPK3PXP');
    expect(uri).toContain('issuer=TransformBiz');
  });
});
