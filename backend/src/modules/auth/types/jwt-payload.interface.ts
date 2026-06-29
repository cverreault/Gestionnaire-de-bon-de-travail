export interface JwtPayload {
  /** User UUID */
  sub: string;
  email: string;
  role: string;
  /**
   * Tenant the user belongs to (B6.3). JwtAuthGuard rejects with 401
   * when this doesn't match the tenant derived from the request's
   * sub-domain — anti-spoofing.
   */
  tenantId: string;
  iat?: number;
  exp?: number;
}
