import { HttpException, Injectable } from '@nestjs/common';

interface WindowState { started_at: number; requests: number; }
interface RateLimitResponse { header(name: string, value: string): unknown; }
export type PolicyName = 'auth' | 'feed' | 'uploads' | 'general';
interface RouteMetrics { route: string; requests: number; rejected: number; total_latency_ms: number; }

const POLICIES: Record<PolicyName, { limit: number; window_ms: number; label: string }> = {
  auth: { limit: 10, window_ms: 60_000, label: 'Registro y OTP · por IP' },
  feed: { limit: 60, window_ms: 10_000, label: 'Feed · por usuario' },
  uploads: { limit: 20, window_ms: 60_000, label: 'Subida de video · por usuario' },
  general: { limit: 60, window_ms: 10_000, label: 'Otras rutas · por usuario' },
};

@Injectable()
export class ApiManagementService {
  private readonly windows = new Map<string, WindowState>();
  private readonly routes = new Map<string, RouteMetrics>();
  private totalRequests = 0;
  private rejectedRequests = 0;

  policyFor(path: string): PolicyName {
    if (path.startsWith('/v1/demo/api-management/probe/')) {
      const selected = path.slice('/v1/demo/api-management/probe/'.length);
      if (selected === 'auth' || selected === 'feed' || selected === 'uploads') return selected;
    }
    if (path === '/v1/auth/register' || path === '/v1/auth/token') return 'auth';
    if (path === '/v1/feed' || path.startsWith('/v1/feed/')) return 'feed';
    if (path === '/v1/uploads' || path.startsWith('/v1/uploads/')) return 'uploads';
    return 'general';
  }

  enforce(policy: PolicyName, key: string, response: RateLimitResponse): void {
    const now = Date.now();
    this.removeExpired(now);
    const config = POLICIES[policy];
    const windowKey = `${policy}:${key}`;
    const current = this.windows.get(windowKey);
    const state = !current || now - current.started_at >= config.window_ms ? { started_at: now, requests: 0 } : current;
    state.requests += 1;
    this.windows.set(windowKey, state);
    this.totalRequests += 1;
    const remaining = Math.max(0, config.limit - state.requests);
    const reset = Math.ceil((state.started_at + config.window_ms - now) / 1000);
    response.header('X-RateLimit-Limit', String(config.limit));
    response.header('X-RateLimit-Remaining', String(remaining));
    response.header('X-RateLimit-Reset', String(reset));
    if (state.requests > config.limit) {
      this.rejectedRequests += 1;
      response.header('Retry-After', String(reset));
      throw new HttpException('Límite de API alcanzado; inténtalo de nuevo más tarde', 429);
    }
  }

  record(method: string, path: string, status: number, latencyMs: number): void {
    if (!path.startsWith('/v1/')) return;
    const route = this.routeLabel(method, path);
    const current = this.routes.get(route) ?? { route, requests: 0, rejected: 0, total_latency_ms: 0 };
    current.requests += 1;
    if (status === 429) current.rejected += 1;
    current.total_latency_ms += latencyMs;
    this.routes.set(route, current);
  }

  snapshot(): { policies: Record<PolicyName, { limit: number; window_ms: number; label: string }>; routes: Array<{ route: string; requests: number; rejected: number; avg_latency_ms: number }>; active_keys: number; total_requests: number; rejected_requests: number } {
    this.removeExpired(Date.now());
    return {
      policies: POLICIES,
      routes: [...this.routes.values()].map(({ route, requests, rejected, total_latency_ms }) => ({ route, requests, rejected, avg_latency_ms: Math.round(total_latency_ms / requests) })).sort((a, b) => b.requests - a.requests),
      active_keys: this.windows.size, total_requests: this.totalRequests, rejected_requests: this.rejectedRequests,
    };
  }

  private removeExpired(now: number): void {
    for (const [key, state] of this.windows) {
      const policy = key.split(':', 1)[0] as PolicyName;
      if (now - state.started_at >= POLICIES[policy].window_ms) this.windows.delete(key);
    }
  }

  private routeLabel(method: string, path: string): string {
    if (path.startsWith('/v1/demo/api-management/probe/')) return `DEMO ${this.policyFor(path)}`;
    if (path.startsWith('/v1/demo/')) return 'GET /v1/demo/*';
    if (path.startsWith('/v1/auth/demo/')) return 'POST /v1/auth/demo/*';
    if (path.startsWith('/v1/feed')) return `${method} /v1/feed`;
    if (path.startsWith('/v1/uploads')) return `${method} /v1/uploads`;
    if (path.startsWith('/v1/social')) return `${method} /v1/social`;
    if (path.startsWith('/v1/videos')) return `${method} /v1/videos`;
    if (path.startsWith('/v1/notifications')) return `${method} /v1/notifications`;
    if (path.startsWith('/v1/users')) return `${method} /v1/users`;
    return `${method} ${path}`;
  }
}
