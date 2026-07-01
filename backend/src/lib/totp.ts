/**
 * TOTP (Time-based One-Time Password) — RFC 6238 / HOTP RFC 4226.
 *
 * A dependency-free second factor that needs NO email/SMTP and NO network:
 * the user scans a QR (otpauth:// URI) into an authenticator app once, then the
 * app and server independently derive the same 6-digit code from a shared
 * secret + the current time. This is the SMTP-free path for "double auth".
 *
 * All primitives use Node's built-in crypto (HMAC-SHA1). Verified against the
 * RFC 6238 Appendix B test vectors (see totp.test.ts).
 */

import { createHmac, randomBytes, timingSafeEqual } from 'crypto';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** Encode bytes as RFC 4648 base32 (no padding) — the authenticator secret format. */
export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

/** Decode an RFC 4648 base32 string (padding/whitespace tolerant) to bytes. */
export function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/=+$/, '').replace(/\s/g, '');
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = BASE32_ALPHABET.indexOf(ch);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** Generate a new random base32 secret (default 20 bytes = 160 bits). */
export function generateTotpSecret(bytes = 20): string {
  return base32Encode(randomBytes(bytes));
}

/** HOTP: a code for a specific counter value. */
export function hotp(secretBase32: string, counter: number, digits = 6): string {
  const key = base32Decode(secretBase32);
  const buf = Buffer.alloc(8);
  // 64-bit big-endian counter.
  buf.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  buf.writeUInt32BE(counter >>> 0, 4);
  const hmac = createHmac('sha1', key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return (binary % 10 ** digits).toString().padStart(digits, '0');
}

export interface TotpOptions {
  time?: number;   // ms since epoch (default: now)
  period?: number; // seconds per step (default 30)
  digits?: number; // default 6
}

/** TOTP: the current code for a secret. */
export function totp(secretBase32: string, opts: TotpOptions = {}): string {
  const period = opts.period ?? 30;
  const time = opts.time ?? Date.now();
  const counter = Math.floor(time / 1000 / period);
  return hotp(secretBase32, counter, opts.digits ?? 6);
}

/**
 * Verify a submitted token against the secret, allowing a ±`window` step drift
 * (clock skew / typing delay). Constant-time comparison.
 */
export function verifyTotp(token: string, secretBase32: string, opts: TotpOptions & { window?: number } = {}): boolean {
  const clean = String(token).replace(/\s/g, '');
  const digits = opts.digits ?? 6;
  if (!/^\d+$/.test(clean) || clean.length !== digits) return false;
  const period = opts.period ?? 30;
  const time = opts.time ?? Date.now();
  const window = opts.window ?? 1;
  const base = Math.floor(time / 1000 / period);
  for (let i = -window; i <= window; i++) {
    const candidate = hotp(secretBase32, base + i, digits);
    // Constant-time compare (both fixed length).
    if (candidate.length === clean.length && timingSafeEqual(Buffer.from(candidate), Buffer.from(clean))) {
      return true;
    }
  }
  return false;
}

/** Build the otpauth:// URI that authenticator apps import (render as a QR). */
export function otpauthUri(secretBase32: string, accountEmail: string, issuer: string): string {
  const label = encodeURIComponent(`${issuer}:${accountEmail}`);
  const params = new URLSearchParams({ secret: secretBase32, issuer, algorithm: 'SHA1', digits: '6', period: '30' });
  return `otpauth://totp/${label}?${params.toString()}`;
}
