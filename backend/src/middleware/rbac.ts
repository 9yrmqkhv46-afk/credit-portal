import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';

/**
 * Middleware factory that checks if the authenticated user's role is in the allowed roles.
 */
export function authorize(...allowedRoles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({ error: 'Insufficient permissions.' });
      return;
    }

    next();
  };
}
