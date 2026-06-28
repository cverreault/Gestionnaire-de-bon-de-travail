import { Module } from '@nestjs/common';
import { AuditController } from './api/audit.controller';
import { AuditListener } from './application/audit.listener';
import { AuditService } from './application/services/audit.service';

/**
 * Audit module — capture immuable des domain events.
 *
 * Voir : docs/adrs/ADR-007, plan §B2, ./audit.registration.ts
 */
@Module({
  controllers: [AuditController],
  providers: [AuditService, AuditListener],
})
export class AuditModule {}
