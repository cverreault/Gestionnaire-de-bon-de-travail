import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { Scope } from '../../common/decorators/scope.decorator';
import { PublicApiThrottle } from './public-api-throttle.decorator';
import { SettingsService } from '../settings/settings.service';
import { ProcessService } from '../process/process.service';
import { UsersService } from '../users/users.service';

/**
 * Public API v1 — Catalog (B8).
 *
 * Read-only endpoints external systems need before creating a work
 * order : list task types (for `taskTypeId`), list technicians (for
 * `assignedToId`), fetch a process snapshot (for `newStepId` on a
 * transition), etc.
 *
 * No write endpoints here — catalog editing is an internal admin
 * concern, not something a third-party integration should touch.
 */
@ApiTags('Catalog')
@ApiSecurity('api-key')
@PublicApiThrottle()
@Controller('v1')
export class PublicCatalogController {
  constructor(
    private readonly settings: SettingsService,
    private readonly processes: ProcessService,
    private readonly users: UsersService,
  ) {}

  @Get('task-types')
  @Scope('read-only')
  @ApiOperation({ summary: 'Lister les types de tâche disponibles' })
  taskTypes(@Query('isActive') isActive?: string) {
    return this.settings.findAll({
      isActive: isActive === undefined ? undefined : isActive === 'true',
    });
  }

  @Get('client-types')
  @Scope('read-only')
  @ApiOperation({ summary: 'Lister les types de client disponibles' })
  clientTypes(@Query('isActive') isActive?: string) {
    return this.settings.findAllClientTypes({
      isActive: isActive === undefined ? undefined : isActive === 'true',
    });
  }

  @Get('address-types')
  @Scope('read-only')
  @ApiOperation({ summary: 'Lister les types d\'adresse disponibles' })
  addressTypes(@Query('isActive') isActive?: string) {
    return this.settings.findAllAddressTypes({
      isActive: isActive === undefined ? undefined : isActive === 'true',
    });
  }

  @Get('technicians')
  @Scope('read-only')
  @ApiOperation({ summary: 'Lister les techniciens actifs (pour assignation)' })
  technicians() {
    return this.users.findActiveTechnicians();
  }

  @Get('processes/:id/snapshot')
  @Scope('read-only')
  @ApiOperation({
    summary:
      'Snapshot d\'un processus (statuts + transitions) — nécessaire pour choisir un `newStepId` sur une transition',
  })
  processSnapshot(@Param('id', ParseUUIDPipe) id: string) {
    return this.processes.getSnapshot(id);
  }
}
