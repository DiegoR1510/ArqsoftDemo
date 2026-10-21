import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

export type Role = 'USER' | 'CREATOR' | 'BRAND_OWNER' | 'BRAND_MEMBER' | 'MODERATOR' | 'ADMIN' | 'FINANCE';
export interface AccessClaims {
  sub: string; role: Role; handle: string; iat: number; exp: number; jti: string; typ: 'access';
}
const encode = (value: unknown): string => Buffer.from(JSON.stringify(value)).toString('base64url');
const decode = <T>(value: string): T => JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as T;
const signature = (value: string, secret: string): string => createHmac('sha256', secret).update(value).digest('base64url');

export function signAccessToken(input: { sub: string; role: Role; handle: string }, secret: string, lifetimeSeconds = 900): string {
  const header = encode({ alg: 'HS256', typ: 'JWT' });
  const now = Math.floor(Date.now() / 1000);
  const payload: AccessClaims = { ...input, iat: now, exp: now + lifetimeSeconds, jti: randomUUID(), typ: 'access' };
  const encodedPayload = encode(payload);
  return `${header}.${encodedPayload}.${signature(`${header}.${encodedPayload}`, secret)}`;
}

export function verifyAccessToken(token: string, secret: string): AccessClaims {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('JWT inválido');
  const [header, payload, received] = parts;
  if (typeof header !== 'string' || typeof payload !== 'string') throw new Error('JWT inválido');
  const expected = signature(`${header}.${payload}`, secret);
  if (typeof received !== 'string' || !timingSafeEqual(Buffer.from(received), Buffer.from(expected))) throw new Error('Firma JWT inválida');
  const claims = decode<AccessClaims>(payload);
  if (claims.typ !== 'access' || claims.exp <= Math.floor(Date.now() / 1000)) throw new Error('JWT expirado o inválido');
  return claims;
}

export function bearerToken(value: string | undefined): string | undefined {
  if (!value?.startsWith('Bearer ')) return undefined;
  return value.slice('Bearer '.length);
}
export function hasRole(role: Role, allowed: readonly Role[]): boolean { return allowed.includes(role); }
