import { Router, Response } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { authenticate, AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { sendOtpEmail } from '../lib/mailer';

const router = Router();

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

/**
 * Strong password policy enforced on REGISTRATION only.
 *
 * Requirements:
 *   - >= 10 characters
 *   - at least one uppercase letter
 *   - at least one lowercase letter
 *   - at least one digit
 *   - at least one special character
 *
 * We deliberately do NOT enforce this policy on /login. Pre-existing users
 * (including the seeded sample client `client@example.com` whose password is
 * only 10 characters but uses a different character set) must still be able to
 * log in.
 */
const STRONG_PASSWORD_REGEX =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{10,}$/;
const STRONG_PASSWORD_MESSAGE =
  'Password must be at least 10 characters and include uppercase, lowercase, number, and special character.';

const registerSchema = z.object({
  email: z.string().email('Invalid email address'),
  name: z.string().min(1, 'Name is required'),
  password: z.string().regex(STRONG_PASSWORD_REGEX, STRONG_PASSWORD_MESSAGE),
});

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  // Only require non-empty — never reject a legitimate existing user just
  // because their pre-existing password is shorter than the new policy.
  password: z.string().min(1, 'Password is required'),
});

// ---------------------------------------------------------------------------
// Per-account brute-force lockout
// ---------------------------------------------------------------------------
//
// In-memory map of failed login attempts keyed by lowercased email. After
// LOCKOUT_THRESHOLD failures within LOCKOUT_WINDOW_MS the account is locked
// for the remainder of the window. A successful login clears the counter.
//
// This complements the existing IP-based rate limiter in `index.ts` — IP
// limiting protects against a single attacker hammering the endpoint; this
// account limiter protects a specific user from password spraying across
// many IPs.

const LOCKOUT_THRESHOLD = 5;
const LOCKOUT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

interface FailureEntry {
  count: number;
  firstFailureAt: number;
}

const loginFailures: Map<string, FailureEntry> = new Map();

function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isAccountLocked(email: string): boolean {
  const entry = loginFailures.get(normaliseEmail(email));
  if (!entry) return false;
  const windowExpired = Date.now() - entry.firstFailureAt > LOCKOUT_WINDOW_MS;
  if (windowExpired) {
    loginFailures.delete(normaliseEmail(email));
    return false;
  }
  return entry.count >= LOCKOUT_THRESHOLD;
}

function recordLoginFailure(email: string): void {
  const key = normaliseEmail(email);
  const now = Date.now();
  const existing = loginFailures.get(key);
  if (!existing || now - existing.firstFailureAt > LOCKOUT_WINDOW_MS) {
    loginFailures.set(key, { count: 1, firstFailureAt: now });
    return;
  }
  existing.count += 1;
}

function clearLoginFailures(email: string): void {
  loginFailures.delete(normaliseEmail(email));
}

// Exported for tests / future admin tooling. Not used elsewhere.
export const __loginFailuresForTesting = {
  reset(): void {
    loginFailures.clear();
  },
};

// ---------------------------------------------------------------------------
// Email OTP (two-factor) — in-memory store
// ---------------------------------------------------------------------------
//
// Codes are 6 digits, hashed at rest, single-use, expire in 10 minutes, and
// capped at 5 verification attempts. In-memory (single-node) by design, mirroring
// the login-failure map above. Swap for a shared store when horizontally scaled.

type OtpPurpose = 'REGISTER' | 'LOGIN';
const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
interface OtpEntry { hash: string; expiresAt: number; attempts: number }
const otpStore: Map<string, OtpEntry> = new Map();

const otpKey = (purpose: OtpPurpose, email: string) => `${purpose}:${normaliseEmail(email)}`;
const hashCode = (code: string) => crypto.createHash('sha256').update(code).digest('hex');

/** Generate, store and return a fresh 6-digit code for (purpose, email). */
function issueOtp(purpose: OtpPurpose, email: string): string {
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  otpStore.set(otpKey(purpose, email), { hash: hashCode(code), expiresAt: Date.now() + OTP_TTL_MS, attempts: 0 });
  return code;
}

/** Verify a submitted code; consumes it on success. */
function verifyOtp(purpose: OtpPurpose, email: string, code: string): boolean {
  const key = otpKey(purpose, email);
  const entry = otpStore.get(key);
  if (!entry) return false;
  if (Date.now() > entry.expiresAt || entry.attempts >= OTP_MAX_ATTEMPTS) { otpStore.delete(key); return false; }
  entry.attempts += 1;
  const ok = entry.hash === hashCode(String(code));
  if (ok) otpStore.delete(key);
  return ok;
}

export const __otpForTesting = { issueOtp, verifyOtp, reset: () => otpStore.clear() };

// ---------------------------------------------------------------------------
// JWT helper
// ---------------------------------------------------------------------------

function generateToken(user: { id: string; email: string; role: string }): string {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    config.jwtSecret,
    { expiresIn: '24h' }
  );
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

// POST /api/auth/register
router.post('/register', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data = registerSchema.parse(req.body);

    const existingUser = await prisma.user.findUnique({ where: { email: data.email } });
    if (existingUser) {
      res.status(409).json({ error: 'Email already registered.' });
      return;
    }

    // Two-factor: verify the email address via a one-time code before creating
    // the account. Client requests a code via POST /auth/otp/request first.
    if (config.requireClient2fa) {
      const otp = String((req.body?.otp ?? '')).trim();
      if (!otp) {
        res.status(400).json({ error: 'Email verification required. Request a code first.', otpRequired: true });
        return;
      }
      if (!verifyOtp('REGISTER', data.email, otp)) {
        res.status(400).json({ error: 'Invalid or expired verification code.' });
        return;
      }
    }

    const hashedPassword = await bcrypt.hash(data.password, 10);
    // Role is HARDCODED to CLIENT. There is intentionally no public path to
    // create an ADMIN user. Admins are provisioned via `npm run seed`.
    const user = await prisma.user.create({
      data: {
        email: data.email,
        name: data.name,
        password: hashedPassword,
        role: 'CLIENT',
      },
    });

    const token = generateToken(user);
    res.status(201).json({
      token,
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: error.errors });
      return;
    }
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// POST /api/auth/login
router.post('/login', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data = loginSchema.parse(req.body);

    // Account-level lockout check (runs BEFORE the bcrypt compare so a locked
    // attacker doesn't get any timing signal about whether the password was
    // correct).
    if (isAccountLocked(data.email)) {
      res.status(429).json({
        error:
          'Account temporarily locked due to too many failed attempts. Try again in 15 minutes.',
      });
      return;
    }

    const user = await prisma.user.findUnique({ where: { email: data.email } });
    if (!user) {
      // Generic message — do NOT reveal whether the email is registered.
      recordLoginFailure(data.email);
      res.status(401).json({ error: 'Invalid credentials.' });
      return;
    }

    const validPassword = await bcrypt.compare(data.password, user.password);
    if (!validPassword) {
      recordLoginFailure(data.email);
      res.status(401).json({ error: 'Invalid credentials.' });
      return;
    }

    // Success — clear any prior failure counter for this account.
    clearLoginFailures(data.email);

    // Two-factor for CLIENT accounts: password is step 1; an emailed OTP is
    // step 2. Admins are not gated here (they may not have a monitored inbox).
    if (user.role === 'CLIENT' && config.requireClient2fa) {
      const otp = String((req.body?.otp ?? '')).trim();
      if (!otp) {
        const code = issueOtp('LOGIN', user.email);
        try { await sendOtpEmail(user.email, code, 'LOGIN'); } catch { /* best-effort */ }
        const resp: Record<string, unknown> = { otpRequired: true, message: 'Enter the verification code sent to your email.' };
        if (config.exposeOtpInDev) resp.devCode = code;
        res.json(resp);
        return;
      }
      if (!verifyOtp('LOGIN', user.email, otp)) {
        res.status(401).json({ error: 'Invalid or expired verification code.' });
        return;
      }
    }

    const token = generateToken(user);
    res.json({
      token,
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: error.errors });
      return;
    }
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// POST /api/auth/otp/request — email a one-time code. { email, purpose }
// Always responds generically (never reveals whether the email is registered).
router.post('/otp/request', async (req: AuthRequest, res: Response): Promise<void> => {
  const email = normaliseEmail(String(req.body?.email ?? ''));
  const purpose: OtpPurpose = req.body?.purpose === 'LOGIN' ? 'LOGIN' : 'REGISTER';
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    res.status(400).json({ error: 'A valid email address is required.' });
    return;
  }
  const code = issueOtp(purpose, email);
  try { await sendOtpEmail(email, code, purpose); } catch { /* best-effort */ }
  const resp: Record<string, unknown> = { message: 'If the address is valid, a verification code has been sent.' };
  if (config.exposeOtpInDev) resp.devCode = code; // dev only — never in production
  res.json(resp);
});

// POST /api/auth/admin-login — password-only administrator sign-in.
// Anyone who supplies a valid admin password (any admin's own password, or the
// configured ADMIN_SHARED_PASSWORD) is signed in as an administrator.
router.post('/admin-login', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const password = String(req.body?.password ?? '');
    if (!password) { res.status(400).json({ error: 'Password is required.' }); return; }

    const admins = await prisma.user.findMany({ where: { role: 'ADMIN' }, orderBy: { createdAt: 'asc' } });
    if (admins.length === 0) { res.status(401).json({ error: 'No administrator account is provisioned.' }); return; }

    // 1) Configured shared password → sign in as the primary admin.
    if (config.adminSharedPassword && password === config.adminSharedPassword) {
      const admin = admins[0];
      res.json({ token: generateToken(admin), user: { id: admin.id, email: admin.email, name: admin.name, role: admin.role } });
      return;
    }
    // 2) Match any individual admin's own password.
    for (const admin of admins) {
      if (await bcrypt.compare(password, admin.password)) {
        res.json({ token: generateToken(admin), user: { id: admin.id, email: admin.email, name: admin.name, role: admin.role } });
        return;
      }
    }
    res.status(401).json({ error: 'Invalid administrator password.' });
  } catch {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// GET /api/auth/me
router.get('/me', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { id: true, email: true, name: true, role: true, createdAt: true },
    });

    if (!user) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }

    res.json({ user });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// POST /api/auth/logout (client-side token removal - server acknowledges)
router.post('/logout', authenticate, (_req: AuthRequest, res: Response): void => {
  res.json({ message: 'Logged out successfully. Remove token on client side.' });
});

export default router;
