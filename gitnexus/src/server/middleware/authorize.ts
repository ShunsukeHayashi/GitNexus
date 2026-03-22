/**
 * Express RBAC authorization middleware factory
 * T018: JWT-based RBAC Authentication
 */

import type { Request, Response, NextFunction } from 'express';
import { ROLE_HIERARCHY } from '../auth-types.js';
import type { RbacRole } from '../auth-types.js';

/**
 * Require the authenticated user to have at least `minRole`.
 * Must be used AFTER `authenticate` middleware.
 */
export function authorize(minRole: RbacRole) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const auth = req.jwtAuth;
    if (!auth) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }
    const userLevel = ROLE_HIERARCHY[auth.role] ?? 0;
    const required  = ROLE_HIERARCHY[minRole];
    if (userLevel < required) {
      res.status(403).json({ error: `Requires '${minRole}' role or higher` });
      return;
    }
    next();
  };
}
