import { Router, Response } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { authenticate, AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';

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
