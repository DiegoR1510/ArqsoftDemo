import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { bearerToken, verifyAccessToken } from '@kipu/auth';
import { ApiManagementService } from './api-management.service';

interface GatewayRequest { headers: Record<string, string | string[] | undefined>; originalUrl: string; }

@Injectable()
export class GatewayAuthGuard implements CanActivate {
  private readonly secret = process.env.KIPU_JWT_SECRET ?? 'kipu-local-development-secret-change-me';
  constructor(private readonly apiManagement: ApiManagementService) {}
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<GatewayRequest>();
    let claims;
    try { claims = verifyAccessToken(bearerToken(this.header(request, 'authorization')) ?? '', this.secret); }
    catch { throw new UnauthorizedException('Bearer token requerido o inválido'); }
    const response = context.switchToHttp().getResponse<{ header(name: string, value: string): unknown }>();
    this.apiManagement.enforce(this.apiManagement.policyFor(request.originalUrl.split('?')[0] ?? ''), claims.sub, response);
    return true;
  }
  private header(request: GatewayRequest, name: string): string | undefined {
    const value = request.headers[name];
    return Array.isArray(value) ? value[0] : value;
  }
}
