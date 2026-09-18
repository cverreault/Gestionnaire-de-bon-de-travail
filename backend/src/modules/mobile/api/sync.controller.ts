import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../../../common/decorators/roles.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { SyncService } from '../application/sync/sync.service';
import { SyncQueryDto } from './dto/sync-query.dto';

/** Delta pull of the technician's work orders (B37.6, ADR-016 §1). */
@ApiTags('Mobile')
@ApiBearerAuth('access-token')
@Controller('me/sync')
export class SyncController {
  constructor(private readonly sync: SyncService) {}

  @Get()
  @Roles(Role.TECHNICIAN)
  @ApiOperation({
    summary: 'Tirage delta des BT visibles du technicien',
    description:
      'Curseur keyset (updatedAt, id) ; liste complète des ids visibles à chaque appel ; corps seulement pour les BT modifiés ; ' +
      'snapshots de processus, stock et catalogue de pièces. fullResync=true quand le curseur est absent, altéré ou > 30 j.',
  })
  pull(@CurrentUser() user: { id: string }, @Query() q: SyncQueryDto) {
    return this.sync.pull(user.id, q.cursor, q.limit);
  }
}
