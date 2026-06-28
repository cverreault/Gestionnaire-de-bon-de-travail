import { Controller, Get, Param, ParseUUIDPipe, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../../../common/decorators/roles.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { AuditService } from '../application/services/audit.service';
import { FindAuditQueryDto } from './dto/find-audit-query.dto';

interface JwtUser {
  id: string;
  role: Role;
}

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
   * Export CSV de l'audit log filtré (admin) — pour exports compliance
   * (Loi 25, PIPEDA). Cap à 5000 lignes, UTF-8 avec BOM.
   * Doit être déclaré AVANT @Get('aggregate/:id') pour éviter d'être
   * absorbé par le wildcard de routing.
   */
  @Get('export.csv')
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'Exporter l\'audit log filtré au format CSV',
    description:
      'Reprend exactement les mêmes filtres que GET /audit (eventName, ' +
      'aggregateId, actorUserId, plage occurredAt) mais ignore la pagination. ' +
      'Cap à 5000 lignes. UTF-8 + BOM pour Excel.',
  })
  @ApiResponse({ status: 200, description: 'Fichier CSV' })
  @ApiResponse({ status: 403, description: 'Réservé aux ADMIN' })
  async exportCsv(
    @Query() query: FindAuditQueryDto,
    @Res() res: Response,
  ): Promise<void> {
    const csv = await this.auditService.exportCsv(query);
    const filename = `audit-${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
    res.send(csv);
  }

  /**
   * Timeline d'un agrégat précis (ex: tous les events d'un BT).
   * Retourne les 50 events les plus récents.
   */
  @Get('aggregate/:id')
  @ApiOperation({
    summary: 'Timeline d\'un agrégat (tous les rôles, RBAC sur l\'objet)',
    description:
      'Pour un workOrderId donné, retourne les 50 events les plus récents ' +
      'qui le concernent. ADMIN+DISPATCHER voient tous les BT ; ' +
      'le TECHNICIAN voit uniquement la timeline de ses propres BT.',
  })
  @ApiParam({ name: 'id', type: 'string', description: 'UUID de l\'agrégat (ex: workOrderId)' })
  @ApiResponse({ status: 200, description: 'Timeline (50 events max, plus récents en tête)' })
  @ApiResponse({ status: 403, description: 'Un TECHNICIEN tente de lire un BT qui n\'est pas le sien' })
  @ApiResponse({ status: 404, description: 'Agrégat introuvable' })
  findForAggregate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() currentUser: JwtUser,
  ) {
    return this.auditService.findRecentForAggregate(id, currentUser);
  }
}
