import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Role } from '@prisma/client';

import { WorkOrdersService } from './work-orders.service';
import { TravelService } from './application/travel.service';
import { TravelComputeDto, TravelReportQueryDto } from './dto/travel.dto';
import { CreateWorkOrderDto } from './dto/create-work-order.dto';
import { UpdateWorkOrderDto } from './dto/update-work-order.dto';
import { TransitionStatusDto } from './dto/transition-status.dto';
import { WorkOrderFilterDto } from './dto/work-order-filter.dto';
import { CreateNoteDto } from './dto/create-note.dto';
import { SignaturesDto } from './dto/signatures.dto';
import { AssignAndDispatchDto } from './dto/assign-and-dispatch.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { Idempotent } from '../../common/decorators/idempotent.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

/** Shape of the JWT payload attached to request.user by JwtStrategy */
interface JwtUser {
  id: string;
  role: Role;
}

@ApiTags('Work Orders')
@ApiBearerAuth('access-token')
@Controller('work-orders')
export class WorkOrdersController {
  constructor(
    private readonly workOrdersService: WorkOrdersService,
    private readonly travel: TravelService,
  ) {}

  // ── List ────────────────────────────────────────────────────────────────────

  @Get()
  @Roles(Role.ADMIN, Role.DISPATCHER, Role.TECHNICIAN) // B21 — explicit: CLIENT portal users must not reach staff routes
  @ApiOperation({
    summary: 'Lister les bons de travail',
    description:
      'Retourne une liste paginée. ' +
      'Un administrateur voit tous les BT ; un technicien ne voit que les siens.',
  })
  @ApiResponse({ status: 200, description: 'Liste paginée de BT' })
  findAll(
    @Query() filters: WorkOrderFilterDto,
    @CurrentUser() currentUser: JwtUser,
  ) {
    return this.workOrdersService.findAll(filters, currentUser);
  }

  // ── CSV export ──────────────────────────────────────────────────────────────
  // IMPORTANT : déclaré AVANT GET /:id pour ne pas être avalé par le wildcard.

  @Get('export.csv')
  @Roles(Role.ADMIN, Role.DISPATCHER)
  @ApiOperation({
    summary: 'Exporter la liste filtrée des BT au format CSV',
    description:
      'Reprend exactement les mêmes filtres que GET /work-orders (status, type, technicien, période, etc.) ' +
      'mais ignore la pagination. Cap à 5000 lignes.',
  })
  @ApiResponse({ status: 200, description: 'Fichier CSV (UTF-8 + BOM)' })
  @ApiResponse({ status: 403, description: 'Accès réservé aux administrateurs et dispatchers' })
  async exportCsv(
    @Query() filters: WorkOrderFilterDto,
    @CurrentUser() currentUser: JwtUser,
    @Res() res: Response,
  ): Promise<void> {
    const csv = await this.workOrdersService.exportCsv(filters, currentUser);
    const filename = `work-orders-${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
    res.send(csv);
  }

  // ── B49 — kilométrage ───────────────────────────────────────────────────────

  @Get('travel-report')
  @Roles(Role.ADMIN, Role.DISPATCHER)
  @ApiOperation({ summary: 'Kilométrage des BT terminés sur une période, par technicien (B49)' })
  travelReport(@Query() q: TravelReportQueryDto) {
    return this.travel.report(new Date(q.from), new Date(q.to), q.technicianId);
  }

  @Get('travel-report.csv')
  @Roles(Role.ADMIN, Role.DISPATCHER)
  @ApiOperation({ summary: 'Export CSV du kilométrage (B49)' })
  async travelReportCsv(@Query() q: TravelReportQueryDto, @Res() res: Response): Promise<void> {
    const csv = await this.travel.reportCsv(new Date(q.from), new Date(q.to), q.technicianId);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="kilometrage-${q.from.slice(0, 10)}-${q.to.slice(0, 10)}.csv"`);
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
    res.send('\uFEFF' + csv);
  }

  @Get(':id/travel')
  @Roles(Role.ADMIN, Role.DISPATCHER, Role.TECHNICIAN)
  @ApiOperation({ summary: 'Kilométrage du BT et tracé routier (B49)' })
  async travelInfo(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() currentUser: JwtUser) {
    await this.workOrdersService.findOne(id, currentUser); // 404 / IDOR technicien
    const { assignedToId: _a, ...info } = await this.travel.info(id, { withRoute: true });
    void _a;
    return info;
  }

  @Post(':id/travel/compute')
  @Roles(Role.ADMIN, Role.DISPATCHER, Role.TECHNICIAN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Calculer le kilométrage depuis une origine choisie, aller simple ou aller-retour (B49)" })
  async travelCompute(@Param('id', ParseUUIDPipe) id: string, @Body() dto: TravelComputeDto, @CurrentUser() currentUser: JwtUser) {
    await this.workOrdersService.findOne(id, currentUser); // 404 / IDOR technicien
    return this.travel.compute(id, {
      origin: dto.origin.type === 'COORDS' ? { type: 'COORDS', lat: dto.origin.lat as number, lng: dto.origin.lng as number, label: dto.origin.label } : dto.origin.type === 'POINT' ? { type: 'POINT', pointId: dto.origin.pointId as string } : { type: 'GPS' },
      roundTrip: dto.roundTrip,
    });
  }

  @Get(':id/travel.gpx')
  @Roles(Role.ADMIN, Role.DISPATCHER, Role.TECHNICIAN)
  @ApiOperation({ summary: 'Trajet au format GPX (B49)' })
  async travelGpx(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() currentUser: JwtUser, @Res() res: Response): Promise<void> {
    const wo = await this.workOrdersService.findOne(id, currentUser);
    const gpx = await this.travel.gpx(id, wo.referenceNumber);
    if (!gpx) {
      res.status(404).json({ statusCode: 404, message: 'Trajet indisponible (adresse de départ, coordonnées ou moteur manquants)' });
      return;
    }
    res.setHeader('Content-Type', 'application/gpx+xml; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${wo.referenceNumber}-trajet.gpx"`);
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
    res.send(gpx);
  }

  // ── Detail ──────────────────────────────────────────────────────────────────

  @Get(':id')
  @Roles(Role.ADMIN, Role.DISPATCHER, Role.TECHNICIAN) // B21 — explicit: CLIENT portal users must not reach staff routes
  @ApiOperation({
    summary: 'Détail d\'un bon de travail',
    description: 'Retourne le BT avec ses notes et pièces jointes.',
  })
  @ApiParam({ name: 'id', description: 'UUID du bon de travail' })
  @ApiResponse({ status: 200, description: 'Bon de travail trouvé' })
  @ApiResponse({ status: 404, description: 'Bon de travail introuvable' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() currentUser: JwtUser,
  ) {
    return this.workOrdersService.findOne(id, currentUser);
  }

  // ── Available transitions ────────────────────────────────────────────────────
  // IMPORTANT : déclaré AVANT les routes POST /:id/* pour éviter toute ambiguïté

  @Get(':id/available-transitions')
  @Roles(Role.ADMIN, Role.DISPATCHER, Role.TECHNICIAN) // B21 — explicit: CLIENT portal users must not reach staff routes
  @ApiOperation({ summary: 'Transitions de statut disponibles pour ce BT selon le rôle' })
  @ApiParam({ name: 'id', type: 'string' })
  @ApiResponse({ status: 200, description: 'Liste des transitions disponibles' })
  @ApiResponse({ status: 403, description: 'Accès refusé' })
  @ApiResponse({ status: 404, description: 'Bon de travail introuvable' })
  getAvailableTransitions(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.workOrdersService.getAvailableTransitions(id, user);
  }

  // ── Create ──────────────────────────────────────────────────────────────────

  @Post()
  @Roles(Role.ADMIN, Role.DISPATCHER)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Créer un bon de travail',
    description:
      'Réservé aux administrateurs et dispatchers. ' +
      'Génère automatiquement un numéro de référence (BT-YYYYMMDD-XXXX).',
  })
  @ApiResponse({ status: 201, description: 'Bon de travail créé' })
  @ApiResponse({ status: 403, description: 'Accès réservé aux administrateurs et dispatchers' })
  create(
    @Body() dto: CreateWorkOrderDto,
    @CurrentUser() currentUser: JwtUser,
  ) {
    return this.workOrdersService.create(dto, currentUser);
  }

  // ── Duplicate ──────────────────────────────────────────────────────────────

  @Post(':id/duplicate')
  @Roles(Role.ADMIN, Role.DISPATCHER)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Dupliquer un bon de travail',
    description:
      'Clone le BT source dans un nouveau BT en statut CREATED. ' +
      'Recopie titre, description, type, priorité, client, adresse, templateData. ' +
      'Ne recopie PAS : technicien assigné, dates planifiées, notes, pièces jointes.',
  })
  @ApiParam({ name: 'id', description: 'UUID du BT à dupliquer' })
  @ApiResponse({ status: 201, description: 'Nouveau BT créé' })
  @ApiResponse({ status: 403, description: 'Accès réservé aux administrateurs et dispatchers' })
  @ApiResponse({ status: 404, description: 'Bon de travail source introuvable' })
  duplicate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() currentUser: JwtUser,
  ) {
    return this.workOrdersService.duplicate(id, currentUser);
  }

  // ── Update ──────────────────────────────────────────────────────────────────

  @Patch(':id')
  @Idempotent() // B37.5 — template fields / completion notes replayed from the mobile queue
  @Roles(Role.ADMIN, Role.DISPATCHER, Role.TECHNICIAN) // B21 — explicit: CLIENT portal users must not reach staff routes
  @ApiOperation({
    summary: 'Modifier un bon de travail',
    description:
      'Les administrateurs et dispatchers peuvent modifier tous les champs. ' +
      'Les techniciens ne peuvent modifier que completionNotes et negativeReason.',
  })
  @ApiParam({ name: 'id', description: 'UUID du bon de travail' })
  @ApiResponse({ status: 200, description: 'Bon de travail mis à jour' })
  @ApiResponse({ status: 403, description: 'Modification interdite' })
  @ApiResponse({ status: 404, description: 'Bon de travail introuvable' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateWorkOrderDto,
    @CurrentUser() currentUser: JwtUser,
  ) {
    return this.workOrdersService.update(id, dto, currentUser);
  }

  // ── Assign & Dispatch ────────────────────────────────────────────────────────
  // IMPORTANT : déclaré AVANT :id/transition pour éviter les conflits de routing

  @Post(':id/assign-and-dispatch')
  @Roles(Role.ADMIN, Role.DISPATCHER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Assigner et dispatcher un bon de travail',
    description:
      'Assigne un technicien et passe directement le BT en statut DISPATCHED en une seule opération. ' +
      'Réservé aux administrateurs et dispatchers. ' +
      'Le BT doit être en statut CREATED ou ASSIGNED.',
  })
  @ApiParam({ name: 'id', description: 'UUID du bon de travail' })
  @ApiResponse({ status: 200, description: 'BT dispatché avec succès' })
  @ApiResponse({ status: 400, description: 'Statut incompatible' })
  @ApiResponse({ status: 403, description: 'Accès réservé aux administrateurs et dispatchers' })
  @ApiResponse({ status: 404, description: 'BT ou technicien introuvable' })
  assignAndDispatch(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignAndDispatchDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.workOrdersService.assignAndDispatch(id, dto, user.id);
  }

  // ── Transition ──────────────────────────────────────────────────────────────

  @Post(':id/transition')
  @Idempotent() // B37.5 — replay-safe from the mobile queue (ADR-016 §3)
  @Roles(Role.ADMIN, Role.DISPATCHER, Role.TECHNICIAN) // B21 — explicit: CLIENT portal users must not reach staff routes
  @HttpCode(HttpStatus.OK)
  // Tight rate limit (C7bis) — a legitimate tech transitions at most once
  // every few seconds. 20 per minute leaves room for retries on flaky
  // network without enabling brute-forcing of valid transition payloads.
  @Throttle(
    process.env.THROTTLER_DISABLE === '1'
      ? { short: { ttl: 1000, limit: 1_000_000 } }
      : { short: { ttl: 60000, limit: 20 } },
  )
  @ApiOperation({
    summary: 'Changer le statut d\'un bon de travail',
    description:
      'Déclenche une transition de statut validée selon la machine d\'état. ' +
      'Les techniciens ne peuvent transitionner que leurs propres BT.',
  })
  @ApiParam({ name: 'id', description: 'UUID du bon de travail' })
  @ApiResponse({ status: 200, description: 'Transition effectuée' })
  @ApiResponse({ status: 400, description: 'Transition invalide ou données manquantes' })
  @ApiResponse({ status: 403, description: 'Accès interdit' })
  @ApiResponse({ status: 404, description: 'Bon de travail introuvable' })
  transition(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TransitionStatusDto,
    @CurrentUser() currentUser: JwtUser,
  ) {
    return this.workOrdersService.transition(id, dto, currentUser);
  }

  // ── Notes ────────────────────────────────────────────────────────────────────

  @Get(':id/notes')
  @Roles(Role.ADMIN, Role.DISPATCHER, Role.TECHNICIAN) // B21 — explicit: CLIENT portal users must not reach staff routes
  @ApiOperation({ summary: 'Lister les notes d\'un bon de travail' })
  @ApiParam({ name: 'id', description: 'UUID du bon de travail' })
  @ApiResponse({ status: 200, description: 'Liste des notes' })
  @ApiResponse({ status: 404, description: 'Bon de travail introuvable' })
  findNotes(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() currentUser: JwtUser,
  ) {
    return this.workOrdersService.findNotes(id, currentUser);
  }

  @Post(':id/notes')
  @Idempotent() // B37.5 — replay-safe from the mobile queue (ADR-016 §3)
  @Roles(Role.ADMIN, Role.DISPATCHER, Role.TECHNICIAN) // B21 — explicit: CLIENT portal users must not reach staff routes
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Ajouter une note à un bon de travail',
    description: 'Seuls l\'administrateur et le technicien assigné peuvent ajouter des notes.',
  })
  @ApiParam({ name: 'id', description: 'UUID du bon de travail' })
  @ApiResponse({ status: 201, description: 'Note créée' })
  @ApiResponse({ status: 403, description: 'Accès interdit' })
  @ApiResponse({ status: 404, description: 'Bon de travail introuvable' })
  createNote(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateNoteDto,
    @CurrentUser() currentUser: JwtUser,
  ) {
    return this.workOrdersService.createNote(id, dto, currentUser);
  }

  @Post(':id/signatures')
  @Idempotent() // B37.5 — replay-safe from the mobile queue (ADR-016 §3)
  @Roles(Role.ADMIN, Role.DISPATCHER, Role.TECHNICIAN) // B21 — explicit: CLIENT portal users must not reach staff routes
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Enregistrer les signatures client + technicien (B12)',
    description:
      'Payload = { signatureClient?: dataUrl, signatureTechnician?: dataUrl }. ' +
      'Les deux sont optionnels — envoyer null pour effacer. Data-URL PNG de max ~200 KB.',
  })
  @ApiParam({ name: 'id', description: 'UUID du bon de travail' })
  saveSignatures(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SignaturesDto,
    @CurrentUser() currentUser: JwtUser,
  ) {
    return this.workOrdersService.saveSignatures(id, dto, currentUser);
  }
}
