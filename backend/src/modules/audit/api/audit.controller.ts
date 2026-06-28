import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../../../common/decorators/roles.decorator';
import { AuditService } from '../application/services/audit.service';
import { FindAuditQueryDto } from './dto/find-audit-query.dto';

/**
 * Endpoints de consultation de l'audit log.
 *
 * Réservés strictement aux ADMIN pour deux raisons :
 *  - le contenu peut révéler des champs RGPD/Loi 25 (email, clientId, etc.)
 *  - le compteur d'events peut révéler des patterns business
 */
@ApiTags('Audit')
@ApiBearerAuth('access-token')
@Controller('audit')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  /**
   * Liste paginée + filtrable de toutes les entrées d'audit.
   */
  @Get()
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'Liste paginée des entrées d\'audit (admin)',
    description:
      'Filtrer par eventName, aggregateId, actorUserId ou plage occurredAt. ' +
      'Tri descendant par défaut sur occurredAt.',
  })
  @ApiResponse({ status: 200, description: 'Liste des entrées + métadonnées de pagination' })
  @ApiResponse({ status: 403, description: 'Réservé aux ADMIN' })
  findAll(@Query() query: FindAuditQueryDto) {
    return this.auditService.findAllPaginated(query);
  }

  /**
   * Timeline d'un agrégat précis (ex: tous les events d'un BT).
   * Retourne les 50 events les plus récents.
   */
  @Get('aggregate/:id')
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'Timeline d\'un agrégat (admin)',
    description:
      'Pour un workOrderId donné, retourne les 50 events les plus récents ' +
      'qui le concernent. Utile pour la vue "historique" d\'un BT.',
  })
  @ApiParam({ name: 'id', type: 'string', description: 'UUID de l\'agrégat (ex: workOrderId)' })
  findForAggregate(@Param('id', ParseUUIDPipe) id: string) {
    return this.auditService.findRecentForAggregate(id);
  }
}
