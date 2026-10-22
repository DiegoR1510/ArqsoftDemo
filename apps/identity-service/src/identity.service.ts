import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { randomInt, randomUUID } from 'node:crypto';
import { EventBusClient } from '@kipu/events';
import { bearerToken, signAccessToken, verifyAccessToken, type AccessClaims, type Role } from '@kipu/auth';

export interface RegisterBody { identifier?: string; handle?: string; account_type?: 'personal' | 'creator'; terms_accepted?: boolean; privacy_version?: string; }
export interface TokenBody { grant_type?: 'otp' | 'refresh_token'; user_id?: string; otp?: string; refresh_token?: string; }
export interface ProfilePatch { display_name?: string; biography?: string; external_url?: string; private_account?: boolean; }
interface Account {
  id: string; identifier: string; handle: string; role: Role; account_type: 'personal' | 'creator';
  display_name: string; biography: string; external_url: string; private_account: boolean;
  otp: string; otp_expires_at: number; verified: boolean; created_at: string;
}
interface RefreshSession { account_id: string; family: string; used: boolean; expires_at: number; }

@Injectable()
export class IdentityService {
  private readonly accounts = new Map<string, Account>();
  private readonly refreshSessions = new Map<string, RefreshSession>();
  private readonly revokedFamilies = new Set<string>();
  private readonly audit: Array<{ actor: string; action: string; object: string; timestamp: string }> = [];
  private readonly events = new EventBusClient(process.env.KIPU_EVENT_BUS_URL ?? 'http://127.0.0.1:4010');
  private readonly secret = process.env.KIPU_JWT_SECRET ?? 'kipu-local-development-secret-change-me';

  seedDemo(): { creators: Array<{ id: string; token: string }> } {
    const creators = [
      { id: 'demo-creator-1', handle: 'demo_creator_1' },
      { id: 'demo-creator-2', handle: 'demo_creator_2' },
    ];
    return { creators: creators.map((creator) => {
      if (!this.accounts.has(creator.id)) this.accounts.set(creator.id, { id: creator.id, identifier: `${creator.handle}@demo.local`, handle: creator.handle, role: 'CREATOR', account_type: 'creator', display_name: creator.handle, biography: '', external_url: '', private_account: false, otp: '', otp_expires_at: 0, verified: true, created_at: new Date().toISOString() });
      return { id: creator.id, token: signAccessToken({ sub: creator.id, role: 'CREATOR', handle: creator.handle }, this.secret, 15 * 60) };
    }) };
  }

  register(body: RegisterBody): { user_id: string; handle: string; verification_required: true; otp_expires_at: string } {
    if (!body.identifier || !body.handle || body.terms_accepted !== true) throw new BadRequestException('identifier, handle y aceptación de términos son obligatorios');
    if (!/^[A-Za-z0-9_]{3,24}$/.test(body.handle)) throw new BadRequestException('handle inválido');
    if ([...this.accounts.values()].some((account) => account.identifier === body.identifier || account.handle === body.handle)) throw new BadRequestException('identifier o handle ya registrado');
    const id = randomUUID();
    const otp = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const expires = Date.now() + 5 * 60 * 1000;
    const account: Account = {
      id, identifier: body.identifier, handle: body.handle, role: body.account_type === 'creator' ? 'CREATOR' : 'USER',
      account_type: body.account_type ?? 'personal', display_name: body.handle, biography: '', external_url: '', private_account: false,
      otp, otp_expires_at: expires, verified: false, created_at: new Date().toISOString(),
    };
    this.accounts.set(id, account);
    this.record(id, 'user.created', id);
    console.log(JSON.stringify({ service: 'identity-service', event: 'DEV_OTP', user_id: id, otp, expires_at: new Date(expires).toISOString() }));
    void this.events.publish({ type: 'user.created', payload: { user_id: id, handle: account.handle, role: account.role }, idempotency_key: `user.created:${id}` }).catch(() => undefined);
    return { user_id: id, handle: account.handle, verification_required: true, otp_expires_at: new Date(expires).toISOString() };
  }

  token(body: TokenBody): { access_token: string; refresh_token: string; token_type: 'Bearer'; expires_in: number; user: PublicUser } {
    const session = body.grant_type === 'refresh_token'
      ? this.rotateRefresh(body.refresh_token)
      : { account: this.verifyOtp(body.user_id, body.otp), family: randomUUID() };
    const account = session.account;
    const accessLifetime = 15 * 60;
    const accessToken = signAccessToken({ sub: account.id, role: account.role, handle: account.handle }, this.secret, accessLifetime);
    const refreshToken = randomUUID();
    this.refreshSessions.set(refreshToken, { account_id: account.id, family: session.family, used: false, expires_at: Date.now() + 30 * 24 * 60 * 60 * 1000 });
    return { access_token: accessToken, refresh_token: refreshToken, token_type: 'Bearer', expires_in: accessLifetime, user: this.publicUser(account) };
  }

  introspect(token: string | undefined): { active: boolean; sub?: string; role?: Role; exp?: number } {
    try { const claims = verifyAccessToken(token ?? '', this.secret); return { active: true, sub: claims.sub, role: claims.role, exp: claims.exp }; }
    catch { return { active: false }; }
  }

  authenticate(authorization: string | undefined): { account: Account; claims: AccessClaims } {
    const token = bearerToken(authorization);
    if (!token) throw new UnauthorizedException('Bearer token requerido');
    const claims = verifyAccessToken(token, this.secret);
    const account = this.accounts.get(claims.sub);
    if (!account || !account.verified) throw new UnauthorizedException('Cuenta no disponible');
    return { account, claims };
  }

  publicUser(account: Account): PublicUser { return { id: account.id, handle: account.handle, display_name: account.display_name, account_type: account.account_type, role: account.role, biography: account.biography, external_url: account.external_url, private_account: account.private_account }; }
  getUser(id: string): PublicUser { const account = this.accounts.get(id); if (!account) throw new BadRequestException('Usuario no encontrado'); return this.publicUser(account); }
  me(authorization: string | undefined): PublicUser { return this.publicUser(this.authenticate(authorization).account); }
  updateProfile(authorization: string | undefined, patch: ProfilePatch): PublicUser {
    const account = this.authenticate(authorization).account;
    if (patch.display_name !== undefined) account.display_name = patch.display_name.slice(0, 100);
    if (patch.biography !== undefined) account.biography = patch.biography.slice(0, 150);
    if (patch.external_url !== undefined) account.external_url = patch.external_url;
    if (patch.private_account !== undefined) account.private_account = patch.private_account;
    this.record(account.id, 'user.profile_updated', account.id);
    void this.events.publish({ type: 'user.profile_updated', payload: this.publicUser(account), idempotency_key: `user.profile_updated:${account.id}:${Date.now()}` }).catch(() => undefined);
    return this.publicUser(account);
  }

  private verifyOtp(userId: string | undefined, otp: string | undefined): Account {
    const account = userId ? this.accounts.get(userId) : undefined;
    if (!account || !otp || account.otp !== otp || account.otp_expires_at <= Date.now()) throw new UnauthorizedException('OTP inválido o expirado');
    account.verified = true; account.otp = '';
    return account;
  }

  private rotateRefresh(token: string | undefined): { account: Account; family: string } {
    const session = token ? this.refreshSessions.get(token) : undefined;
    if (!session || session.used || session.expires_at <= Date.now() || this.revokedFamilies.has(session.family)) {
      if (session) this.revokedFamilies.add(session.family);
      throw new UnauthorizedException('Refresh token inválido o reutilizado');
    }
    session.used = true;
    const account = this.accounts.get(session.account_id);
    if (!account) throw new UnauthorizedException('Cuenta no encontrada');
    return { account, family: session.family };
  }

  private record(actor: string, action: string, object: string): void { this.audit.push({ actor, action, object, timestamp: new Date().toISOString() }); }
}

export interface PublicUser { id: string; handle: string; display_name: string; account_type: 'personal' | 'creator'; role: Role; biography: string; external_url: string; private_account: boolean; }
