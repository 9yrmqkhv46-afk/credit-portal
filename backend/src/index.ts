import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config';
import authRoutes from './routes/auth';
import clientRoutes from './routes/client';
import scenarioRoutes from './routes/scenarios';
import adminRoutes from './routes/admin';
import servicingRoutes from './routes/servicing';
import valuationRoutes from './routes/valuation';
import timelineRoutes from './routes/timeline';
import messageRoutes from './routes/messages';
import { ensureSeedData } from './lib/bootstrap';

const app = express();

// Auto-provision admin accounts + sample data on startup unless explicitly
// disabled. Default ON; set AUTO_SEED=false to skip.
const AUTO_SEED = process.env.AUTO_SEED !== 'false';

// ---------------------------------------------------------------------------
// Security middleware
// ---------------------------------------------------------------------------

// Never advertise the framework version.
app.disable('x-powered-by');

// Helmet sets sensible secure defaults, then we tighten a few headers further.
// The API never serves HTML, so a strict CSP is safe.
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        frameAncestors: ["'none'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
      },
    },
  })
);
// Don't leak referrer information to other origins.
app.use(helmet.referrerPolicy({ policy: 'no-referrer' }));
// 180 days HSTS. Browsers will refuse to talk to this host over plain HTTP
// once they see this header, including subdomains.
app.use(
  helmet.hsts({
    maxAge: 15552000,
    includeSubDomains: true,
    preload: false,
  })
);

app.use(cors({
  origin: config.frontendUrl,
  credentials: true,
}));
app.use(express.json());

// ---------------------------------------------------------------------------
// IP-based rate limiter for auth endpoints
// ---------------------------------------------------------------------------
// (Per-account brute-force lockout lives in routes/auth.ts.)

const rateLimitStore: Map<string, { count: number; resetTime: number }> = new Map();
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const RATE_LIMIT_MAX_REQUESTS = 20; // max attempts per window

function rateLimiter(req: Request, res: Response, next: NextFunction): void {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const entry = rateLimitStore.get(ip);

  if (!entry || now > entry.resetTime) {
    rateLimitStore.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS });
    next();
    return;
  }

  if (entry.count >= RATE_LIMIT_MAX_REQUESTS) {
    res.status(429).json({ error: 'Too many requests. Please try again later.' });
    return;
  }

  entry.count++;
  next();
}

// Apply rate limiting to auth endpoints
app.use('/api/auth/login', rateLimiter);
app.use('/api/auth/register', rateLimiter);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/client', clientRoutes);
app.use('/api/client', servicingRoutes);
app.use('/api/loan-scenarios', scenarioRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/valuation', valuationRoutes);
app.use('/api/timeline', timelineRoutes);
app.use('/api/messages', messageRoutes);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start server
if (process.env.NODE_ENV !== 'test') {
  const startListening = () => {
    app.listen(config.port, () => {
      console.log(`Server running on port ${config.port}`);
    });
  };

  if (AUTO_SEED) {
    // Auto-provision admins/sample data, but ALWAYS start the server even if
    // seeding fails so the API stays available.
    ensureSeedData()
      .catch((err) => console.error('[bootstrap] seed error:', err))
      .finally(() => startListening());
  } else {
    startListening();
  }
}

export default app;
