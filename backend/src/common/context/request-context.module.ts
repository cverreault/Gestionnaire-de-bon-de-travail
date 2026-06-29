import { Global, Module } from '@nestjs/common';
import { RequestContextService } from './request-context.service';

/**
 * Global module so any service can inject RequestContextService
 * without explicit `imports`. Same pattern as PrismaModule + the
 * SystemConfigsModule glue from SA.
 */
@Global()
@Module({
  providers: [RequestContextService],
  exports: [RequestContextService],
})
export class RequestContextModule {}
