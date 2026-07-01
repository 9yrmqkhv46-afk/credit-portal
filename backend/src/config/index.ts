import dotenv from 'dotenv';

dotenv.config();

// Any well-known/dev placeholder values that must NEVER appear in production.
// Add to this list if more leak into version control.
const WEAK_JWT_SECRETS = new Set<string>([
  'dev-secret-do-not-use-in-production',
  'dev-secret-change-in-production',
  'changeme',
  'secret',
]);

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  const isProduction = process.env.NODE_ENV === 'production';

  if (!secret) {
    if (isProduction) {
      throw new Error(
        'JWT_SECRET environment variable is required in production. ' +
          'Generate a strong value with `openssl rand -base64 32` and set it on the host.'
      );
    }
    // Only allow a default in non-production (development/test) environments.
    return 'dev-secret-do-not-use-in-production';
  }

  if (isProduction && WEAK_JWT_SECRETS.has(secret)) {
    throw new Error(
      'JWT_SECRET is set to a known development placeholder. Refusing to start in production. ' +
        'Generate a strong value with `openssl rand -base64 32`.'
    );
  }

  // Defence-in-depth: 32+ bytes (~ a base64-encoded 24 raw bytes) in production.
  if (isProduction && secret.length < 32) {
    throw new Error(
      'JWT_SECRET is too short for production (must be at least 32 characters). ' +
        'Generate a strong value with `openssl rand -base64 32`.'
    );
  }

  return secret;
}

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  jwtSecret: getJwtSecret(),
  databaseUrl: process.env.DATABASE_URL || 'file:./dev.db',
  jwtExpiresIn: '24h',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
  appName: process.env.APP_NAME || 'TransformBiz',
  // Shared admin password: when set, anyone who supplies it can sign in as an
  // administrator via POST /auth/admin-login (in addition to any admin's own
  // password). Leave unset to disable.
  adminSharedPassword: process.env.ADMIN_SHARED_PASSWORD || '',
  // Two-factor (email OTP) for CLIENT registration + login. On by default;
  // set REQUIRE_CLIENT_2FA=false to disable.
  requireClient2fa: process.env.REQUIRE_CLIENT_2FA !== 'false',
  // In non-production, OTP codes are returned in the API response (devCode) so
  // the flow is usable without a live mail server. NEVER true in production.
  exposeOtpInDev: process.env.NODE_ENV !== 'production',
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.MAIL_FROM || 'no-reply@transformbiz.local',
  },
};

export const calculatorConfig = {
  dtiCap: 6,
  stressBuffer: 0.03, // 3% added to interest rate for stress testing
  salaryShading: 1.0, // 100% of salary counted
  variableIncomeShading: 0.8, // 80% of variable income counted
  minExpensePerAdult: 1200, // Monthly minimum living expense per adult
  minExpensePerChild: 600, // Monthly minimum living expense per child
  creditCardRepaymentPercent: 0.03, // 3% of credit card limit as monthly repayment
};
