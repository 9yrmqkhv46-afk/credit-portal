import dotenv from 'dotenv';

dotenv.config();

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('JWT_SECRET environment variable is required in production');
    }
    // Only allow a default in non-production (development/test) environments
    return 'dev-secret-do-not-use-in-production';
  }
  return secret;
}

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  jwtSecret: getJwtSecret(),
  databaseUrl: process.env.DATABASE_URL || 'file:./dev.db',
  jwtExpiresIn: '24h',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
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
