/**
 * JWT RBAC Authentication Types
 * T018: JWT-based RBAC for securing API routes and MCP connections
 */

/** RBAC roles — ordered from least to most privileged */
export type RbacRole = 'reader' | 'analyst' | 'admin';

/** JWT payload embedded in tokens */
export interface JwtPayload {
  sub: string;       // subject (API key hash or user ID)
  role: RbacRole;    // RBAC role
  iat?: number;      // issued at
  exp?: number;      // expiration
}

/** Enriched Express request with auth context */
export interface AuthRequest extends Request {
  jwtAuth?: JwtPayload;
}

/** Role hierarchy — each role includes permissions of all lower roles */
export const ROLE_HIERARCHY: Record<RbacRole, number> = {
  reader:  1,
  analyst: 2,
  admin:   3,
};
