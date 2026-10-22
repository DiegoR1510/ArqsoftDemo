import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

export interface RankingCandidate { id: string; popularity: number; created_at: string; hashtags: string[]; }
interface Rules { version: string; strategy: 'popularity' | 'recency'; popularity_weight: number; recency_weight: number; hashtag_weight: number; }
interface RankingBody { candidates?: RankingCandidate[]; }

@Injectable()
export class RankingService {
  private activeVersion = 'rk-2026.10.json';
  private latencyMs = 0;
  private failing = false;

  async rank(body: RankingBody): Promise<{ ids: string[]; ruleset_version: string }> {
    if (this.latencyMs > 0) await new Promise((resolve) => setTimeout(resolve, this.latencyMs));
    if (this.failing) throw new ServiceUnavailableException('Ranking simulado no disponible');
    const rules = await this.loadRules(this.activeVersion);
    const candidates = body.candidates ?? [];
    const oldest = Math.min(...candidates.map((candidate) => Date.parse(candidate.created_at)));
    const ids = rules.strategy === 'recency'
      ? [...candidates].sort((left, right) => right.created_at.localeCompare(left.created_at)).map((candidate) => candidate.id)
      : candidates.map((candidate) => ({ id: candidate.id, score: candidate.popularity * rules.popularity_weight + Math.max(0, Date.parse(candidate.created_at) - oldest) / 86_400_000 * rules.recency_weight + candidate.hashtags.length * rules.hashtag_weight })).sort((left, right) => right.score - left.score).map((entry) => entry.id);
    return { ids, ruleset_version: rules.version };
  }

  async setRuleset(version: string): Promise<{ ruleset_version: string }> {
    await this.loadRules(version);
    this.activeVersion = version;
    return { ruleset_version: version };
  }
  getRuleset(): { ruleset_version: string } { return { ruleset_version: this.activeVersion }; }
  setMode(body: { failing?: boolean; latency_ms?: number }): { failing: boolean; latency_ms: number } { this.failing = body.failing === true; this.latencyMs = Math.max(0, body.latency_ms ?? 0); return { failing: this.failing, latency_ms: this.latencyMs }; }

  private async loadRules(version: string): Promise<Rules> {
    const file = path.join(process.cwd(), 'apps', 'ranking-service', 'rules', version);
    return JSON.parse(await readFile(file, 'utf8')) as Rules;
  }
}
