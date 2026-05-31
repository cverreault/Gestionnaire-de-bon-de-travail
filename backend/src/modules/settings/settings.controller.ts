import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { SettingsService } from './settings.service';
import { CreateTaskTypeDto } from './dto/create-task-type.dto';
import { UpdateTaskTypeDto } from './dto/update-task-type.dto';
import { CreateClientTypeDto } from './dto/create-client-type.dto';
import { UpdateClientTypeDto } from './dto/update-client-type.dto';
import { CreateAddressTypeDto } from './dto/create-address-type.dto';
import { UpdateAddressTypeDto } from './dto/update-address-type.dto';
import {
  CreateAddressTypeFieldDto,
  UpdateAddressTypeFieldDto,
} from './dto/address-type-field.dto';
import { Roles } from '../../common/decorators/roles.decorator';

@ApiTags('Settings')
@ApiBearerAuth('access-token')
@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  // ── TaskTypes ─────────────────────────────────────────────────────────────

  /**
   * GET /settings/task-types
   * Accessible à tous les utilisateurs authentifiés (lecture seule).
   */
  @Get('task-types')
  @ApiOperation({
    summary: 'Lister les types de tâche',
    description:
      'Retourne tous les types de tâche. ' +
      'Paramètre optionnel isActive pour filtrer les actifs/inactifs.',
  })
  @ApiQuery({
    name: 'isActive',
    required: false,
    type: Boolean,
    description: 'Filtrer par état actif (true/false). Omis = tous.',
  })
  @ApiResponse({ status: 200, description: 'Liste des types de tâche' })
  findAll(@Query('isActive') isActive?: string) {
    // Query params arrivent toujours en string — on convertit manuellement
    const filter: { isActive?: boolean } = {};
    if (isActive === 'true') filter.isActive = true;
    if (isActive === 'false') filter.isActive = false;
    return this.settingsService.findAll(filter);
  }

  /**
   * GET /settings/task-types/:id
   * Accessible à tous les utilisateurs authentifiés (lecture seule).
   */
  @Get('task-types/:id')
  @ApiOperation({ summary: 'Détail d\'un type de tâche' })
  @ApiParam({ name: 'id', description: 'UUID du type de tâche' })
  @ApiResponse({ status: 200, description: 'Type de tâche trouvé' })
  @ApiResponse({ status: 404, description: 'Type de tâche introuvable' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.settingsService.findOne(id);
  }

  /**
   * POST /settings/task-types
   * Réservé aux ADMIN.
   */
  @Post('task-types')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Créer un type de tâche',
    description: 'Réservé aux administrateurs. Le nom doit être unique.',
  })
  @ApiResponse({ status: 201, description: 'Type de tâche créé' })
  @ApiResponse({ status: 409, description: 'Nom déjà utilisé' })
  @ApiResponse({ status: 403, description: 'Accès réservé aux administrateurs' })
  create(@Body() dto: CreateTaskTypeDto) {
    return this.settingsService.create(dto);
  }

  /**
   * PATCH /settings/task-types/:id
   * Réservé aux ADMIN.
   */
  @Patch('task-types/:id')
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'Modifier un type de tâche',
    description:
      'Réservé aux administrateurs. Permet aussi de réactiver un type désactivé via isActive.',
  })
  @ApiParam({ name: 'id', description: 'UUID du type de tâche' })
  @ApiResponse({ status: 200, description: 'Type de tâche mis à jour' })
  @ApiResponse({ status: 404, description: 'Type de tâche introuvable' })
  @ApiResponse({ status: 409, description: 'Nom déjà utilisé' })
  @ApiResponse({ status: 403, description: 'Accès réservé aux administrateurs' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTaskTypeDto,
  ) {
    return this.settingsService.update(id, dto);
  }

  /**
   * DELETE /settings/task-types/:id
   * Réservé aux ADMIN. Effectue un soft-delete (isActive = false).
   * Refusé si des BT actifs sont liés à ce type.
   */
  @Delete('task-types/:id')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Désactiver un type de tâche (soft-delete)',
    description:
      'Réservé aux administrateurs. ' +
      'Positionne isActive à false. ' +
      'Échoue si des bons de travail actifs utilisent encore ce type.',
  })
  @ApiParam({ name: 'id', description: 'UUID du type de tâche' })
  @ApiResponse({ status: 200, description: 'Type de tâche désactivé' })
  @ApiResponse({ status: 400, description: 'BT actifs liés — désactivation refusée' })
  @ApiResponse({ status: 404, description: 'Type de tâche introuvable' })
  @ApiResponse({ status: 403, description: 'Accès réservé aux administrateurs' })
  softDelete(@Param('id', ParseUUIDPipe) id: string) {
    return this.settingsService.softDelete(id);
  }

  // ── ClientTypeConfig ───────────────────────────────────────────────────────

  /**
   * GET /settings/client-types
   * Accessible à tous les utilisateurs authentifiés.
   */
  @Get('client-types')
  @ApiOperation({
    summary: 'Lister les types de clients',
    description:
      'Retourne tous les types de clients configurés. ' +
      'Paramètre optionnel isActive pour filtrer les actifs/inactifs.',
  })
  @ApiQuery({
    name: 'isActive',
    required: false,
    type: Boolean,
    description: 'Filtrer par état actif (true/false). Omis = tous.',
  })
  @ApiResponse({ status: 200, description: 'Liste des types de clients' })
  findAllClientTypes(@Query('isActive') isActive?: string) {
    const filter: { isActive?: boolean } = {};
    if (isActive === 'true') filter.isActive = true;
    if (isActive === 'false') filter.isActive = false;
    return this.settingsService.findAllClientTypes(filter);
  }

  /**
   * POST /settings/client-types
   * Réservé aux ADMIN.
   */
  @Post('client-types')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Créer un type de client',
    description: 'Réservé aux administrateurs. Le nom et le code doivent être uniques.',
  })
  @ApiResponse({ status: 201, description: 'Type de client créé' })
  @ApiResponse({ status: 409, description: 'Nom ou code déjà utilisé' })
  @ApiResponse({ status: 403, description: 'Accès réservé aux administrateurs' })
  createClientType(@Body() dto: CreateClientTypeDto) {
    return this.settingsService.createClientType(dto);
  }

  /**
   * PATCH /settings/client-types/:id
   * Réservé aux ADMIN.
   */
  @Patch('client-types/:id')
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'Modifier un type de client',
    description:
      'Réservé aux administrateurs. Permet aussi de réactiver via isActive.',
  })
  @ApiParam({ name: 'id', description: 'UUID du type de client' })
  @ApiResponse({ status: 200, description: 'Type de client mis à jour' })
  @ApiResponse({ status: 404, description: 'Type de client introuvable' })
  @ApiResponse({ status: 409, description: 'Nom ou code déjà utilisé' })
  @ApiResponse({ status: 403, description: 'Accès réservé aux administrateurs' })
  updateClientType(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateClientTypeDto,
  ) {
    return this.settingsService.updateClientType(id, dto);
  }

  /**
   * DELETE /settings/client-types/:id
   * Réservé aux ADMIN. Effectue un soft-delete (isActive = false).
   */
  @Delete('client-types/:id')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Désactiver un type de client (soft-delete)',
    description: 'Réservé aux administrateurs. Positionne isActive à false.',
  })
  @ApiParam({ name: 'id', description: 'UUID du type de client' })
  @ApiResponse({ status: 200, description: 'Type de client désactivé' })
  @ApiResponse({ status: 404, description: 'Type de client introuvable' })
  @ApiResponse({ status: 403, description: 'Accès réservé aux administrateurs' })
  deleteClientType(@Param('id', ParseUUIDPipe) id: string) {
    return this.settingsService.deleteClientType(id);
  }

  // ── AddressTypeConfig ──────────────────────────────────────────────────────

  /**
   * GET /settings/address-types
   * Accessible à tous les utilisateurs authentifiés.
   */
  @Get('address-types')
  @ApiOperation({
    summary: "Lister les types d'emplacement",
    description:
      "Retourne tous les types d'emplacement configurés. " +
      'Paramètre optionnel isActive pour filtrer les actifs/inactifs.',
  })
  @ApiQuery({
    name: 'isActive',
    required: false,
    type: Boolean,
    description: 'Filtrer par état actif (true/false). Omis = tous.',
  })
  @ApiResponse({ status: 200, description: "Liste des types d'emplacement" })
  findAllAddressTypes(@Query('isActive') isActive?: string) {
    const filter: { isActive?: boolean } = {};
    if (isActive === 'true') filter.isActive = true;
    if (isActive === 'false') filter.isActive = false;
    return this.settingsService.findAllAddressTypes(filter);
  }

  /**
   * POST /settings/address-types
   * Réservé aux ADMIN.
   */
  @Post('address-types')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: "Créer un type d'emplacement",
    description: 'Réservé aux administrateurs. Le nom et le code doivent être uniques.',
  })
  @ApiResponse({ status: 201, description: "Type d'emplacement créé" })
  @ApiResponse({ status: 409, description: 'Nom ou code déjà utilisé' })
  @ApiResponse({ status: 403, description: 'Accès réservé aux administrateurs' })
  createAddressType(@Body() dto: CreateAddressTypeDto) {
    return this.settingsService.createAddressType(dto);
  }

  /**
   * PATCH /settings/address-types/:id
   * Réservé aux ADMIN.
   */
  @Patch('address-types/:id')
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: "Modifier un type d'emplacement",
    description:
      'Réservé aux administrateurs. Permet aussi de réactiver via isActive.',
  })
  @ApiParam({ name: 'id', description: "UUID du type d'emplacement" })
  @ApiResponse({ status: 200, description: "Type d'emplacement mis à jour" })
  @ApiResponse({ status: 404, description: "Type d'emplacement introuvable" })
  @ApiResponse({ status: 409, description: 'Nom ou code déjà utilisé' })
  @ApiResponse({ status: 403, description: 'Accès réservé aux administrateurs' })
  updateAddressType(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAddressTypeDto,
  ) {
    return this.settingsService.updateAddressType(id, dto);
  }

  /**
   * DELETE /settings/address-types/:id
   * Réservé aux ADMIN. Effectue un soft-delete (isActive = false).
   */
  @Delete('address-types/:id')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Désactiver un type d'emplacement (soft-delete)",
    description: "Réservé aux administrateurs. Positionne isActive à false.",
  })
  @ApiParam({ name: 'id', description: "UUID du type d'emplacement" })
  @ApiResponse({ status: 200, description: "Type d'emplacement désactivé" })
  @ApiResponse({ status: 404, description: "Type d'emplacement introuvable" })
  @ApiResponse({ status: 403, description: 'Accès réservé aux administrateurs' })
  deleteAddressType(@Param('id', ParseUUIDPipe) id: string) {
    return this.settingsService.deleteAddressType(id);
  }

  // ── AddressType custom fields ─────────────────────────────────────────────

  @Get('address-types/:id/fields')
  @ApiOperation({ summary: "Liste des champs custom d'un type d'emplacement" })
  listAddressTypeFields(@Param('id', ParseUUIDPipe) id: string) {
    return this.settingsService.listAddressTypeFields(id);
  }

  @Post('address-types/:id/fields')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "Ajouter un champ custom à un type d'emplacement" })
  addAddressTypeField(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateAddressTypeFieldDto,
  ) {
    return this.settingsService.addAddressTypeField(id, dto);
  }

  @Patch('address-types/:id/fields/:fieldId')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: "Modifier un champ custom" })
  updateAddressTypeField(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('fieldId', ParseUUIDPipe) fieldId: string,
    @Body() dto: UpdateAddressTypeFieldDto,
  ) {
    return this.settingsService.updateAddressTypeField(id, fieldId, dto);
  }

  @Delete('address-types/:id/fields/:fieldId')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: "Supprimer un champ custom" })
  removeAddressTypeField(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('fieldId', ParseUUIDPipe) fieldId: string,
  ) {
    return this.settingsService.removeAddressTypeField(id, fieldId);
  }
}
