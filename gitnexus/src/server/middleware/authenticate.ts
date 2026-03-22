/**
 * Express authentication middleware
 * Validates Bearer JWT tokens on protected routes.
 * T018: JWT-based RBAC Authentication
 */

import type { Request, Response, NextFunction } from 'express';
import { extractBearer, verifyToken } from '../auth.js';
import type { JwtPayload } from '../auth-types.js';

/** Extend Express Request to carry JWT auth payload (using jwtAuth to avoid conflict with MCP SDK AuthInfo) */
declare module 'express-serve-static-core' {
  interface Request {
    jwtAuth?: JwtPayload;
  }
}

/**
 * Middleware: require a valid Bearer JWT.
 * Sets `req.jwtAuth` on success; responds 401 on failure.
 */
export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const token = extractBearer(req.headers.authorization);
  if (!token) {
    res.status(401).json({ error: 'Missing Bearer token' });
    return;
  }
  const payload = verifyToken(token);
  if (!payload) {
    res.status(401).json({ error: 'Invalid or expired token' });
    return;
  }
  req.jwtAuth = payload;
  next();
}

/**
 * Middleware: optional auth — attaches `req.jwtAuth` if a valid token is present,
 * but does not reject unauthenticated requests. Useful for routes that behave
 * differently for authenticated users but still allow public access.
 */
export function authenticateOptional(req: Request, res: Response, next: NextFunction): void {
  const token = extractBearer(req.headers.authorization);
  if (token) {
    const payload = verifyToken(token);
    if (payload) req.jwtAuth = payload;
  }
  next();
}
