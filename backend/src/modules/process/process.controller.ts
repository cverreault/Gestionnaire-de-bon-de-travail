import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Role } from '@prisma/client';

import { Roles } from '../../common/decorators/roles.decorator';
import { ProcessService } from './process.service';
import { CreateProcessDefinitionDto } from './dto/create-process-definition.dto';
import { UpdateProcessDefinitionDto } from './dto/update-process-definition.dto';
import { CreateProcessStatusDto } from './dto/create-process-status.dto';
import { UpdateProcessStatusDto } from './dto/update-process-status.dto';
import { CreateProcessTransitionDto } from './dto/create-process-transition.dto';
import { UpdateProcessTransitionDto } from './dto/update-process-transition.dto';
import { ProcessFilterDto } from './dto/process-filter.dto';

@ApiTags('Processes')
@ApiBearerAuth('access-token')
@Controller('processes')
export class ProcessController {
  constructor(private readonly processService: ProcessService) {}

  // ── ProcessDefinition CRUD ──────────────────────────────────────────────────

  @Post()
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Créer un processus',
    description: 'Crée une nouvelle définition de processus. Réservé aux administrateurs.',
  })
  @ApiResponse({ status: 201, description: 'Processus créé' })
  @ApiResponse({ status: 400, description: 'Données invalides' })
  @ApiResponse({ status: 401, description: 'Non authentifié' })
  @ApiResponse({ status: 403, description: 'Accès réservé aux administrateurs' })
  @ApiResponse({ status: 409, description: 'Conflit — un processus par défaut existe déjà' })
  create(@Body() dto: CreateProcessDefinitionDto) {
    return this.processService.create(dto);
  }

  @Get()
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'Lister les processus',
    description:
      'Retourne une liste paginée de processus. ' +
      'Filtrable par statut actif et par recherche sur le nom.',
  })
  @ApiResponse({ status: 200, description: 'Liste paginée de processus' })
  @ApiResponse({ status: 401, description: 'Non authentifié' })
  @ApiResponse({ status: 403, description: 'Accès réservé aux administrateurs' })
  findAll(@Query() filter: ProcessFilterDto) {
    return this.processService.findAll(filter);
  }

  @Get(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'Détail d\'un processus',
    description:
      'Retourne la définition complète du processus avec ses statuts et transitions.',
  })
  @ApiParam({ name: 'id', description: 'UUID du processus', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Processus trouvé' })
  @ApiResponse({ status: 401, description: 'Non authentifié' })
  @ApiResponse({ status: 403, description: 'Accès réservé aux administrateurs' })
  @ApiResponse({ status: 404, description: 'Processus introuvable' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.processService.findOne(id);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'Modifier un processus',
    description:
      'Met à jour les métadonnées du processus. Incrémente automatiquement la version.',
  })
  @ApiParam({ name: 'id', description: 'UUID du processus', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Processus mis à jour' })
  @ApiResponse({ status: 400, description: 'Données invalides' })
  @ApiResponse({ status: 401, description: 'Non authentifié' })
  @ApiResponse({ status: 403, description: 'Accès réservé aux administrateurs' })
  @ApiResponse({ status: 404, description: 'Processus introuvable' })
  @ApiResponse({ status: 409, description: 'Conflit isDefault' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProcessDefinitionDto,
  ) {
    return this.processService.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Désactiver un processus (soft delete)',
    description:
      'Passe isActive à false. Bloqué si c\'est le seul processus actif par défaut.',
  })
  @ApiParam({ name: 'id', description: 'UUID du processus', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Processus désactivé' })
  @ApiResponse({ status: 400, description: 'Impossible de désactiver le seul processus par défaut' })
  @ApiResponse({ status: 401, description: 'Non authentifié' })
  @ApiResponse({ status: 403, description: 'Accès réservé aux administrateurs' })
  @ApiResponse({ status: 404, description: 'Processus introuvable' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.processService.remove(id);
  }

  // ── ProcessStatus ──────────────────────────────────────────────────────────

  @Post(':id/statuses')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Ajouter un statut à un processus',
    description:
      'Crée un nouveau statut et l\'associe au processus. ' +
      'Vérifie l\'unicité du code et des flags singleton.',
  })
  @ApiParam({ name: 'id', description: 'UUID du processus', format: 'uuid' })
  @ApiResponse({ status: 201, description: 'Statut créé' })
  @ApiResponse({ status: 400, description: 'Données invalides' })
  @ApiResponse({ status: 401, description: 'Non authentifié' })
  @ApiResponse({ status: 403, description: 'Accès réservé aux administrateurs' })
  @ApiResponse({ status: 404, description: 'Processus introuvable' })
  @ApiResponse({ status: 409, description: 'Code ou flag singleton en conflit' })
  addStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateProcessStatusDto,
  ) {
    return this.processService.addStatus(id, dto);
  }

  @Patch(':id/statuses/:sid')
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'Modifier un statut',
    description:
      'Met à jour les propriétés d\'un statut. ' +
      'Le code ne peut pas être modifié après création.',
  })
  @ApiParam({ name: 'id', description: 'UUID du processus', format: 'uuid' })
  @ApiParam({ name: 'sid', description: 'UUID du statut', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Statut mis à jour' })
  @ApiResponse({ status: 400, description: 'Données invalides ou statut hors-processus' })
  @ApiResponse({ status: 401, description: 'Non authentifié' })
  @ApiResponse({ status: 403, description: 'Accès réservé aux administrateurs' })
  @ApiResponse({ status: 404, description: 'Processus ou statut introuvable' })
  @ApiResponse({ status: 409, description: 'Flag singleton en conflit' })
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('sid', ParseUUIDPipe) sid: string,
    @Body() dto: UpdateProcessStatusDto,
  ) {
    return this.processService.updateStatus(id, sid, dto);
  }

  @Delete(':id/statuses/:sid')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Supprimer un statut',
    description:
      'Supprime définitivement un statut. ' +
      'Bloqué si des BT actifs utilisent ce statut ou si des transitions le référencent.',
  })
  @ApiParam({ name: 'id', description: 'UUID du processus', format: 'uuid' })
  @ApiParam({ name: 'sid', description: 'UUID du statut', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Statut supprimé' })
  @ApiResponse({ status: 400, description: 'Statut utilisé par des BT actifs ou des transitions' })
  @ApiResponse({ status: 401, description: 'Non authentifié' })
  @ApiResponse({ status: 403, description: 'Accès réservé aux administrateurs' })
  @ApiResponse({ status: 404, description: 'Processus ou statut introuvable' })
  removeStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('sid', ParseUUIDPipe) sid: string,
  ) {
    return this.processService.removeStatus(id, sid);
  }

  // ── ProcessTransition ──────────────────────────────────────────────────────

  @Post(':id/transitions')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Ajouter une transition à un processus',
    description:
      'Crée une nouvelle transition entre deux statuts du processus. ' +
      'Vérifie l\'appartenance des statuts au processus et l\'unicité (from, to).',
  })
  @ApiParam({ name: 'id', description: 'UUID du processus', format: 'uuid' })
  @ApiResponse({ status: 201, description: 'Transition créée' })
  @ApiResponse({ status: 400, description: 'Données invalides ou statuts hors-processus' })
  @ApiResponse({ status: 401, description: 'Non authentifié' })
  @ApiResponse({ status: 403, description: 'Accès réservé aux administrateurs' })
  @ApiResponse({ status: 404, description: 'Processus ou statut introuvable' })
  @ApiResponse({ status: 409, description: 'Transition (from, to) déjà existante' })
  addTransition(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateProcessTransitionDto,
  ) {
    return this.processService.addTransition(id, dto);
  }

  @Patch(':id/transitions/:tid')
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'Modifier une transition',
    description:
      'Met à jour le libellé, les rôles autorisés, les champs requis ou l\'ordre d\'une transition. ' +
      'fromStatusId et toStatusId ne peuvent pas être modifiés.',
  })
  @ApiParam({ name: 'id', description: 'UUID du processus', format: 'uuid' })
  @ApiParam({ name: 'tid', description: 'UUID de la transition', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Transition mise à jour' })
  @ApiResponse({ status: 400, description: 'Données invalides ou transition hors-processus' })
  @ApiResponse({ status: 401, description: 'Non authentifié' })
  @ApiResponse({ status: 403, description: 'Accès réservé aux administrateurs' })
  @ApiResponse({ status: 404, description: 'Processus ou transition introuvable' })
  updateTransition(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('tid', ParseUUIDPipe) tid: string,
    @Body() dto: UpdateProcessTransitionDto,
  ) {
    return this.processService.updateTransition(id, tid, dto);
  }

  @Delete(':id/transitions/:tid')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Supprimer une transition' })
  @ApiParam({ name: 'id', description: 'UUID du processus', format: 'uuid' })
  @ApiParam({ name: 'tid', description: 'UUID de la transition', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Transition supprimée' })
  @ApiResponse({ status: 401, description: 'Non authentifié' })
  @ApiResponse({ status: 403, description: 'Accès réservé aux administrateurs' })
  @ApiResponse({ status: 404, description: 'Processus ou transition introuvable' })
  removeTransition(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('tid', ParseUUIDPipe) tid: string,
  ) {
    return this.processService.removeTransition(id, tid);
  }

  // ── Snapshot ───────────────────────────────────────────────────────────────

  @Get(':id/snapshot')
  @ApiOperation({
    summary: 'Snapshot complet d\'un processus',
    description:
      'Retourne la définition dénormalisée du processus : statuts triés par position, ' +
      'transitions avec from/to hydratés, et adjacencyMap pour traversal rapide du graphe. ' +
      'Accessible à tous les rôles authentifiés.',
  })
  @ApiParam({ name: 'id', description: 'UUID du processus', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Snapshot du processus' })
  @ApiResponse({ status: 401, description: 'Non authentifié' })
  @ApiResponse({ status: 404, description: 'Processus introuvable' })
  getSnapshot(@Param('id', ParseUUIDPipe) id: string) {
    return this.processService.getSnapshot(id);
  }
}
