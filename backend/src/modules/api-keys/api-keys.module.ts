import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { ApiKeysService } from './api-keys.service';

/**
 * ApiKeys module (B8).
 *
 * @Global because the auth strategy, the public-api guards, and the
 * tenant-admin CRUD controller all need to inject `ApiKeysService`
 * without importing this module explicitly.
 */
@Global()
@Module({
  imports: [PrismaModule],
  providers: [ApiKeysService],
  exports: [ApiKeysService],
})
export class ApiKeysModule {}
