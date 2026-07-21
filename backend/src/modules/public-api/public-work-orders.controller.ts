import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  ApiOperation,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Scope } from '../../common/decorators/scope.decorator';
import { CurrentApiKey } from '../../common/decorators/current-api-key.decorator';
import { PublicApiThrottle } from '../../common/decorators/public-api-throttle.decorator';
import type { ResolvedApiKey } from '../../common/contracts/api-key.contract';
import { WorkOrdersService } from '../work-orders/work-orders.service';
import { CreateWorkOrderDto } from '../work-orders/dto/create-work-order.dto';
import { WorkOrderFilterDto } from '../work-orders/dto/work-order-filter.dto';
import { TransitionStatusDto } from '../work-orders/dto/transition-status.dto';
import { CreateNoteDto } from '../work-orders/dto/create-note.dto';
import { SignaturesDto } from '../work-orders/dto/signatures.dto';
import { ReportsService } from '../reports/application/reports.service';
import { PublicUpdateWorkOrderDto } from './dto/public-update-work-order.dto';

/**
 * Public API v1 — Work Orders (B8).
 *
 * Wrapper over `WorkOrdersService` that :
 *   - Authenticates via `X-API-Key` (ApiKeyAuthGuard).
 *   - Enforces per-endpoint scope via `@Scope()` + `ApiScopeGuard`.
 *   - Synthesizes a `CurrentUserRef` from the API key so the internal
 *     service (which was designed for JWT-authenticated flows) keeps
 *     working unchanged. Since only ADMINs can mint keys, the synthesized
 *     role is always ADMIN — that maps naturally to the scope hierarchy.
 *
 * Endpoints intentionally omitted from v1 :
 *   - PATCH accepts a filtered DTO — no `status` field, callers must use
 *     `/transition` to change state (validated by the ProcessEngine).
 *   - CSV export is internal-only (bulk data export needs a different
 *     UX and audit path).
 *   - `/:id/assign-and-dispatch` is composable via one create + one
 *     transition and would be a UX-only convenience for the public.
 */
@ApiTags('Work Orders')
@ApiSecurity('api-key')
@PublicApiThrottle()
@Controller('v1/work-orders')
export class PublicWorkOrdersController {
  constructor(
    private readonly workOrders: WorkOrdersService,
    private readonly reports: ReportsService,
  ) {}

  @Get()
  @Scope('read-only')
  @ApiOperation({ summary: 'Lister les BTs (pagination, filtres)' })
  list(
    @Query() filters: WorkOrderFilterDto,
    @CurrentApiKey() key: ResolvedApiKey,
  ) {
    return this.workOrders.findAll(filters, asCurrentUser(key));
  }

  @Get(':id')
  @Scope('read-only')
  @ApiOperation({ summary: 'Détail d\'un BT' })
  findOne(@Param('id') id: string, @CurrentApiKey() key: ResolvedApiKey) {
    return this.workOrders.findOne(id, asCurrentUser(key));
  }

  @Get(':id/available-transitions')
  @Scope('read-only')
  @ApiOperation({ summary: 'Lister les transitions possibles depuis le statut courant' })
  availableTransitions(
    @Param('id') id: string,
    @CurrentApiKey() key: ResolvedApiKey,
  ) {
    return this.workOrders.getAvailableTransitions(id, asCurrentUser(key));
  }

  @Get(':id/notes')
  @Scope('read-only')
  @ApiOperation({ summary: 'Lister les notes du BT' })
  listNotes(@Param('id') id: string, @CurrentApiKey() key: ResolvedApiKey) {
    return this.workOrders.findNotes(id, asCurrentUser(key));
  }

  @Post()
  @Scope('read-write')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Créer un BT' })
  create(
    @Body() dto: CreateWorkOrderDto,
    @CurrentApiKey() key: ResolvedApiKey,
  ) {
    return this.workOrders.create(dto, asCurrentUser(key));
  }

  @Post(':id/duplicate')
  @Scope('read-write')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Dupliquer un BT existant' })
  duplicate(@Param('id') id: string, @CurrentApiKey() key: ResolvedApiKey) {
    return this.workOrders.duplicate(id, asCurrentUser(key));
  }

  @Post(':id/notes')
  @Scope('read-write')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Ajouter une note à un BT' })
  addNote(
    @Param('id') id: string,
    @Body() dto: CreateNoteDto,
    @CurrentApiKey() key: ResolvedApiKey,
  ) {
    return this.workOrders.createNote(id, dto, asCurrentUser(key));
  }

  @Post(':id/transition')
  @Scope('read-write')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Changer le statut d\'un BT (via une transition définie par le processus)',
  })
  transition(
    @Param('id') id: string,
    @Body() dto: TransitionStatusDto,
    @CurrentApiKey() key: ResolvedApiKey,
  ) {
    return this.workOrders.transition(id, dto, asCurrentUser(key));
  }

  @Post(':id/signatures')
  @Scope('read-write')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Enregistrer les signatures client + technicien (B12)',
    description:
      'Payload = { signatureClient?: dataUrl, signatureTechnician?: dataUrl }. ' +
      'Data-URL PNG de max ~200 KB. Passer null pour effacer une signature existante.',
  })
  saveSignatures(
    @Param('id') id: string,
    @Body() dto: SignaturesDto,
    @CurrentApiKey() key: ResolvedApiKey,
  ) {
    return this.workOrders.saveSignatures(id, dto, asCurrentUser(key));
  }

  @Get(':id/report.pdf')
  @Scope('read-only')
  @ApiOperation({
    summary: 'Télécharger le rapport PDF d\'un BT (fiche d\'intervention)',
    description:
      'Rendu HTML → PDF via Puppeteer. Contient les détails du BT, notes, ' +
      'pièces jointes (référence uniquement) et les signatures si présentes. ' +
      'Paramètre `locale=fr|en` — défaut FR.',
  })
  async workOrderReportPdf(
    @Param('id') id: string,
    @CurrentApiKey() key: ResolvedApiKey,
    @Res() res: Response,
    @Query('locale') locale?: string,
  ) {
    const lang: 'fr' | 'en' = locale === 'en' ? 'en' : 'fr';
    const { buffer, filename } = await this.reports.renderWorkOrderPdf(
      id,
      asCurrentUser(key),
      lang,
    );
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', String(buffer.length));
    res.end(buffer);
  }

  @Patch(':id')
  @Scope('read-write')
  @ApiOperation({
    summary: 'Modifier un BT (le champ `status` est interdit — utiliser /transition)',
  })
  update(
    @Param('id') id: string,
    @Body() dto: PublicUpdateWorkOrderDto,
    @CurrentApiKey() key: ResolvedApiKey,
  ) {
    return this.workOrders.update(id, dto, asCurrentUser(key));
  }
}

/**
 * Synthesizes the `CurrentUserRef` shape the internal services expect
 * from the API key. Only ADMINs can mint keys, so the effective role is
 * always ADMIN — the outer `@Scope()` guard adds the API-key-level
 * permission on top.
 */
function asCurrentUser(key: ResolvedApiKey) {
  return { id: key.createdByUserId, role: Role.ADMIN };
}
