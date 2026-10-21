import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { bearerToken, verifyAccessToken } from '@kipu/auth';

interface GatewayRequest { headers: Record<string, string | string[] | undefined>; }

@Injectable()
export class GatewayAuthGuard implements CanActivate {
  private readonly secret = process.env.KIPU_JWT_SECRET ?? 'kipu-local-development-secret-change-me';
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<GatewayRequest>();
    try { verifyAccessToken(bearerToken(this.header(request, 'authorization')) ?? '', this.secret); return true; }
    catch { throw new UnauthorizedException('Bearer token requerido o inválido'); }
  }
  private header(request: GatewayRequest, name: string): string | undefined {
    const value = request.headers[name];
    return Array.isArray(value) ? value[0] : value;
  }
}
