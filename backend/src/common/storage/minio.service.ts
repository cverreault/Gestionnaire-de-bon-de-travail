import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client as MinioClient } from 'minio';
import { Readable } from 'stream';

@Injectable()
export class MinioService implements OnModuleInit {
  private readonly logger = new Logger(MinioService.name);
  private client: MinioClient;
  private bucket: string;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    const endPoint = this.configService.getOrThrow<string>('MINIO_ENDPOINT');
    const port = parseInt(
      this.configService.getOrThrow<string>('MINIO_PORT'),
      10,
    );
    const accessKey = this.configService.getOrThrow<string>('MINIO_ACCESS_KEY');
    const secretKey = this.configService.getOrThrow<string>('MINIO_SECRET_KEY');
    this.bucket = this.configService.getOrThrow<string>('MINIO_BUCKET');

    // Determine SSL based on port convention (443 = SSL) or explicit env flag
    const useSSL =
      this.configService.get<string>('MINIO_USE_SSL') === 'true' || port === 443;

    this.client = new MinioClient({
      endPoint,
      port,
      useSSL,
      accessKey,
      secretKey,
    });

    this.logger.log(
      `✅ MinIO client initialised — ${endPoint}:${port} (SSL=${useSSL}) bucket="${this.bucket}"`,
    );

    // Ensure the bucket exists asynchronously (non-blocking at startup)
    this.ensureBucket().catch((err) =>
      this.logger.error('Failed to ensure MinIO bucket', err),
    );
  }

  /**
   * Creates the bucket if it does not already exist.
   */
  async ensureBucket(): Promise<void> {
    const exists = await this.client.bucketExists(this.bucket);
    if (!exists) {
      await this.client.makeBucket(this.bucket);
      this.logger.log(`✅ MinIO bucket "${this.bucket}" created`);
    } else {
      this.logger.log(`MinIO bucket "${this.bucket}" already exists`);
    }
  }

  /**
   * Uploads a file buffer to MinIO.
   *
   * @param buffer   Raw file data
   * @param key      Object key (path inside the bucket)
   * @param mimeType Content-Type header stored as object metadata
   * @param size     File size in bytes
   */
  async uploadFile(
    buffer: Buffer,
    key: string,
    mimeType: string,
    size: number,
  ): Promise<void> {
    const stream = Readable.from(buffer);
    await this.client.putObject(this.bucket, key, stream, size, {
      'Content-Type': mimeType,
    });
    this.logger.log(`Uploaded object "${key}" (${size} bytes)`);
  }

  /**
   * Generates a pre-signed GET URL valid for 1 hour (3600 seconds).
   */
  async getFileUrl(key: string): Promise<string> {
    return this.client.presignedGetObject(this.bucket, key, 3600);
  }

  /**
   * Removes an object from MinIO storage.
   */
  async deleteFile(key: string): Promise<void> {
    await this.client.removeObject(this.bucket, key);
    this.logger.log(`Deleted object "${key}" from MinIO`);
  }

  /**
   * Liste toutes les clés du bucket.
   */
  async listObjectKeys(): Promise<string[]> {
    return new Promise((resolve, reject) => {
      const keys: string[] = [];
      const stream = this.client.listObjectsV2(this.bucket, '', true);
      stream.on('data', (obj) => {
        if (obj.name) keys.push(obj.name);
      });
      stream.on('end', () => resolve(keys));
      stream.on('error', reject);
    });
  }

  /**
   * Renvoie un Readable stream pour l'objet donné.
   */
  async getObjectStream(key: string): Promise<Readable> {
    return this.client.getObject(this.bucket, key);
  }

  /**
   * Upload un Readable stream vers MinIO. Utilisé par le restore qui itère
   * sur les entrées d'un tar et n'a pas la taille d'avance.
   */
  async uploadStream(
    key: string,
    stream: Readable,
    mimeType: string,
  ): Promise<void> {
    await this.client.putObject(this.bucket, key, stream, undefined, {
      'Content-Type': mimeType,
    });
  }

  /**
   * Vide le bucket — utilisé avant un restore.
   */
  async clearBucket(): Promise<number> {
    const keys = await this.listObjectKeys();
    if (keys.length === 0) return 0;
    await this.client.removeObjects(this.bucket, keys);
    this.logger.log(`Cleared ${keys.length} objects from MinIO bucket`);
    return keys.length;
  }
}
