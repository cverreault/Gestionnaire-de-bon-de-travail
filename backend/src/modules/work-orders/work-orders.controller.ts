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
import { Role } from '@prisma/client';

import { WorkOrdersService } from './work-orders.service';
import { CreateWorkOrderDto } from './dto/create-work-order.dto';
import { UpdateWorkOrderDto } from './dto/update-work-order.dto';
import { TransitionStatusDto } from './dto/transition-status.dto';
import { WorkOrderFilterDto } from './dto/work-order-filter.dto';
import { CreateNoteDto } from './dto/create-note.dto';
import { AssignAndDispatchDto } from './dto/assign-and-dispatch.dto';
import { Roles } from '../../common/decorators/roles.decorator';
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
  constructor(private readonly workOrdersService: WorkOrdersService) {}

  // ── List ────────────────────────────────────────────────────────────────────

  @Get()
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

  // ── Detail ──────────────────────────────────────────────────────────────────

  @Get(':id')
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
  @HttpCode(HttpStatus.OK)
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
}
