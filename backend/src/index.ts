import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config';
import authRoutes from './routes/auth';
import clientRoutes from './routes/client';
import scenarioRoutes from './routes/scenarios';
import adminRoutes from './routes/admin';

const app = express();

// Middleware
app.use(helmet());
app.use(cors({
  origin: config.frontendUrl,
  credentials: true,
}));
app.use(express.json());

// Simple in-memory rate limiter for auth endpoints
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
app.use('/api/loan-scenarios', scenarioRoutes);
app.use('/api/admin', adminRoutes);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start server
if (process.env.NODE_ENV !== 'test') {
  app.listen(config.port, () => {
    console.log(`Server running on port ${config.port}`);
  });
}

export default app;
