export interface JwtPayload {
  /** User UUID */
  sub: string;
  email: string;
  role: string;
  iat?: number;
  exp?: number;
}
