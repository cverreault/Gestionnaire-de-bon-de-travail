import { Controller, Get } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckService,
  MemoryHealthIndicator,
  DiskHealthIndicator,
  HealthCheckResult,
} from '@nestjs/terminus';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { DatabaseHealthIndicator } from './indicators/database.health';
import { MinioHealthIndicator } from './indicators/minio.health';

export interface BasicHealthResponse {
  status: 'ok';
  timestamp: string;
  uptime: number;
  version: string;
}

/**
 * Endpoints de healthcheck — accessibles sans JWT.
 *
 * - `GET /api/health` : check léger pour les liveness probes (Docker, Nginx).
 *   Retourne immédiatement {status:ok} si le process répond.
 *
 * - `GET /api/health/detailed` : check approfondi pour le monitoring
 *   (Uptime Kuma, Prometheus, BetterStack). Vérifie DB + MinIO + mémoire
 *   + disque. Retourne 200 si tout OK, 503 si un check échoue.
 *
 * Voir : ADR-007, plan §C2.
 */
@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly healthCheck: HealthCheckService,
    private readonly db: DatabaseHealthIndicator,
    private readonly minio: MinioHealthIndicator,
    private readonly memory: MemoryHealthIndicator,
    private readonly disk: DiskHealthIndicator,
  ) {}

  // ── Liveness probe — léger, Docker compatible ──────────────────────────
  @Public()
  @Get()
  @ApiOperation({
    summary: 'Liveness probe (léger)',
    description:
      'Endpoint public sans JWT. Répond toujours 200 si le process tourne. ' +
      'À utiliser pour Docker healthcheck et reverse proxies.',
  })
  @ApiResponse({
    status: 200,
    description: 'Le service répond',
    schema: {
      example: {
        status: 'ok',
        timestamp: '2026-06-28T10:00:00.000Z',
        uptime: 3600.42,
        version: '1.0.0',
      },
    },
  })
  check(): BasicHealthResponse {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: process.env['npm_package_version'] ?? '1.0.0',
    };
  }

  // ── Readiness probe — vérification complète ────────────────────────────
  @Public()
  @Get('detailed')
  @HealthCheck()
  @ApiOperation({
    summary: 'Readiness probe (détaillée)',
    description:
      'Vérifie DB, MinIO, mémoire heap (<400 MB), mémoire RSS (<500 MB), ' +
      'disque (<90 % plein). Retourne 200 si tout OK, 503 si un check échoue.',
  })
  @ApiResponse({ status: 200, description: 'Tous les checks passent' })
  @ApiResponse({ status: 503, description: 'Au moins un check a échoué' })
  detailed(): Promise<HealthCheckResult> {
    return this.healthCheck.check([
      () => this.db.check('database'),
      () => this.minio.check('minio'),
      () => this.memory.checkHeap('memory_heap', 400 * 1024 * 1024),
      () => this.memory.checkRSS('memory_rss', 500 * 1024 * 1024),
      () => this.disk.checkStorage('disk', {
        path: '/',
        thresholdPercent: 0.9,
      }),
    ]);
  }
}
