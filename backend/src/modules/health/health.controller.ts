import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';

export interface HealthResponse {
  status: 'ok';
  timestamp: string;
  uptime: number;
  version: string;
}

/**
 * Health check endpoint — accessible sans JWT.
 * Utilisé par Docker, Nginx et les outils de monitoring.
 *
 * GET /api/health → { status, timestamp, uptime, version }
 */
@ApiTags('Health')
@Controller('health')
export class HealthController {
  @Public()
  @Get()
  @ApiOperation({
    summary: 'Vérification de santé du service',
    description:
      'Endpoint public (pas de JWT requis). Utilisé par Docker healthcheck et les reverse proxies.',
  })
  @ApiResponse({
    status: 200,
    description: 'Le service est opérationnel',
    schema: {
      example: {
        status: 'ok',
        timestamp: '2026-04-30T10:00:00.000Z',
        uptime: 3600.42,
        version: '1.0.0',
      },
    },
  })
  check(): HealthResponse {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: process.env['npm_package_version'] ?? '1.0.0',
    };
  }
}
