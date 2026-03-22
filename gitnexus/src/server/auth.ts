/**
 * JWT generation and verification
 * T018: JWT-based RBAC Authentication
 */

import jwt from 'jsonwebtoken';
import type { JwtPayload, RbacRole } from './auth-types.js';

const JWT_SECRET = process.env.GITNEXUS_JWT_SECRET ?? 'gitnexus-dev-secret-change-in-production';
const TOKEN_TTL  = process.env.GITNEXUS_TOKEN_TTL  ?? '24h';

/** Sign a JWT with the given subject and role */
export function signToken(sub: string, role: RbacRole): string {
  return jwt.sign({ sub, role }, JWT_SECRET, { expiresIn: TOKEN_TTL } as jwt.SignOptions);
}

/** Verify and decode a JWT. Returns null if invalid/expired. */
export function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JwtPayload;
  } catch {
    return null;
  }
}

/** Extract bearer token from Authorization header */
export function extractBearer(authHeader?: string): string | null {
  if (!authHeader?.startsWith('Bearer ')) return null;
  return authHeader.slice('Bearer '.length).trim() || null;
}
