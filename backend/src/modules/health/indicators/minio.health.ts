import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HealthIndicator, HealthIndicatorResult, HealthCheckError } from '@nestjs/terminus';
import { Client as MinioClient } from 'minio';

/**
 * Vérifie que le serveur MinIO répond et que le bucket configuré existe.
 *
 * Volontairement, ce checker ne dépend PAS de `MinioService` (qui vit dans
 * le module `attachments`). Il instancie son propre client à partir de la
 * config — duplication minime mais conformité à ADR-001 (pas d'import
 * cross-module).
 */
@Injectable()
export class MinioHealthIndicator extends HealthIndicator implements OnModuleInit {
  private readonly logger = new Logger(MinioHealthIndicator.name);
  private client!: MinioClient;
  private bucket!: string;

  constructor(private readonly configService: ConfigService) {
    super();
  }

  onModuleInit() {
    const endPoint = this.configService.getOrThrow<string>('MINIO_ENDPOINT');
    const port = parseInt(this.configService.getOrThrow<string>('MINIO_PORT'), 10);
    const accessKey = this.configService.getOrThrow<string>('MINIO_ACCESS_KEY');
    const secretKey = this.configService.getOrThrow<string>('MINIO_SECRET_KEY');
    this.bucket = this.configService.getOrThrow<string>('MINIO_BUCKET');
    const useSSL =
      this.configService.get<string>('MINIO_USE_SSL') === 'true' || port === 443;

    this.client = new MinioClient({ endPoint, port, accessKey, secretKey, useSSL });
  }

  async check(key: string): Promise<HealthIndicatorResult> {
    const start = Date.now();
    try {
      const exists = await this.client.bucketExists(this.bucket);
      const latencyMs = Date.now() - start;
      if (!exists) {
        throw new HealthCheckError(
          'MinIO bucket missing',
          this.getStatus(key, false, { latencyMs, bucket: this.bucket }),
        );
      }
      return this.getStatus(key, true, { latencyMs, bucket: this.bucket });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new HealthCheckError(
        'MinIO ping failed',
        this.getStatus(key, false, { error: message }),
      );
    }
  }
}
