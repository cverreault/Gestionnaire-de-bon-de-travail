import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
  ApiResponse,
} from '@nestjs/swagger';
import { ClientType, Role } from '@prisma/client';
import { ClientsService } from './clients.service';
import { CreateClientDto, CreateClientAddressDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { UpdateClientAddressDto } from './dto/update-client-address.dto';
import { FindAllClientsDto, UnifiedSearchDto } from './dto/search-client.dto';
import { Roles } from '../../common/decorators/roles.decorator';

@ApiTags('Clients')
@ApiBearerAuth('access-token')
@Controller('clients')
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) {}

  // ──────────────────────────────────────────────────────────────────────────
  // GET /clients/search — déclarée EN PREMIER, avant /:id, pour éviter tout
  // conflit de routage NestJS (« search » serait interprété comme un UUID sinon).
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * GET /api/clients/addresses/all
   * Retourne toutes les adresses de tous les clients avec le nom du client associé.
   * Déclaré avant /:id pour éviter le conflit de routage.
   */
  @Get('addresses/all')
  @Roles(Role.ADMIN, Role.DISPATCHER)
  @ApiOperation({
    summary: 'Liste de toutes les adresses (toutes clients confondus)',
    description: 'Retourne chaque adresse enrichie du firstName/lastName/email du client lié.',
  })
  @ApiResponse({ status: 200, description: 'Liste des adresses avec leur client' })
  @ApiResponse({ status: 401, description: 'Non authentifié' })
  findAllAddresses(@Query('search') search?: string) {
    return this.clientsService.findAllAddresses(search);
  }

  /**
   * POST /api/clients/addresses
   * Crée une adresse sans client associé (orpheline).
   */
  @Post('addresses')
  @Roles(Role.ADMIN, Role.DISPATCHER)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Créer une adresse standalone (sans client)' })
  @ApiResponse({ status: 201, description: 'Adresse créée' })
  createStandaloneAddress(@Body() dto: CreateClientAddressDto) {
    return this.clientsService.createStandaloneAddress(dto);
  }

  /**
   * PATCH /api/clients/addresses/:addressId
   * Met à jour n'importe quelle adresse par son id (orpheline ou rattachée).
   * Accepte également `clientId` (uuid ou null) pour relier/délier l'adresse.
   */
  @Patch('addresses/:addressId')
  @Roles(Role.ADMIN, Role.DISPATCHER)
  @ApiOperation({
    summary: 'Modifier une adresse par id (accès direct)',
    description:
      'Permet de modifier une adresse sans connaître le client (utile pour les ' +
      'adresses orphelines et pour relier/délier une adresse à un client).',
  })
  @ApiParam({ name: 'addressId', type: 'string', description: 'UUID de l\'adresse' })
  updateAddressById(
    @Param('addressId') addressId: string,
    @Body() dto: UpdateClientAddressDto,
  ) {
    return this.clientsService.updateAddressById(addressId, dto);
  }

  /**
   * DELETE /api/clients/addresses/:addressId
   * Supprime une adresse par son id (orpheline ou rattachée).
   */
  @Delete('addresses/:addressId')
  @Roles(Role.ADMIN, Role.DISPATCHER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Supprimer une adresse par id (accès direct)' })
  @ApiParam({ name: 'addressId', type: 'string', description: 'UUID de l\'adresse' })
  deleteAddressById(@Param('addressId') addressId: string) {
    return this.clientsService.deleteAddressById(addressId);
  }

  /**
   * GET /api/clients/search
   * Recherche unifiée dans les clients locaux enrichis ET la base externe.
   * Chaque résultat porte un champ `source` ('local' | 'external').
   */
  @Get('search')
  @Roles(Role.ADMIN, Role.DISPATCHER)
  @ApiOperation({
    summary: 'Recherche unifiée — clients locaux + base externe',
    description:
      'Lance une recherche en parallèle dans les deux sources et retourne ' +
      'la liste fusionnée enrichie du champ `source` pour distinguer l\'origine.',
  })
  @ApiQuery({
    name: 'q',
    required: false,
    type: String,
    description: 'Terme de recherche (prénom, nom, email)',
  })
  @ApiResponse({ status: 200, description: 'Liste unifiée des résultats' })
  @ApiResponse({ status: 401, description: 'Non authentifié' })
  @ApiResponse({ status: 403, description: 'Accès réservé aux administrateurs et dispatchers' })
  searchUnified(@Query() query: UnifiedSearchDto) {
    return this.clientsService.searchUnified(query.q);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Routes CRUD — Clients enrichis
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * GET /api/clients
   * Liste paginée des clients avec filtres optionnels.
   */
  @Get()
  @Roles(Role.ADMIN, Role.DISPATCHER)
  @ApiOperation({
    summary: 'Liste paginée des clients',
    description:
      'Retourne la liste des clients avec pagination et filtres optionnels. ' +
      'La recherche ILIKE porte sur le prénom, le nom et l\'email.',
  })
  @ApiQuery({ name: 'search',     required: false, type: String,    description: 'Filtre ILIKE sur prénom, nom, email' })
  @ApiQuery({ name: 'clientType', required: false, enum: ClientType, description: 'Filtrer par type de client' })
  @ApiQuery({ name: 'isActive',   required: false, type: Boolean,   description: 'Filtrer sur le statut actif/inactif' })
  @ApiQuery({ name: 'page',       required: false, type: Number,    description: 'Page courante (base 1, défaut : 1)' })
  @ApiQuery({ name: 'limit',      required: false, type: Number,    description: 'Résultats par page (défaut : 20, max : 100)' })
  @ApiResponse({ status: 200, description: 'Liste paginée de clients' })
  @ApiResponse({ status: 401, description: 'Non authentifié' })
  @ApiResponse({ status: 403, description: 'Accès réservé aux administrateurs et dispatchers' })
  findAll(@Query() query: FindAllClientsDto) {
    return this.clientsService.findAll(query);
  }

  /**
   * GET /api/clients/:id
   * Détail complet d'un client (adresses + compteur de BT).
   */
  @Get(':id')
  @Roles(Role.ADMIN, Role.DISPATCHER)
  @ApiOperation({ summary: 'Détail d\'un client' })
  @ApiParam({ name: 'id', type: 'string', description: 'UUID du client' })
  @ApiResponse({ status: 200, description: 'Client trouvé avec ses adresses' })
  @ApiResponse({ status: 401, description: 'Non authentifié' })
  @ApiResponse({ status: 403, description: 'Réservé aux ADMIN/DISPATCHER — un TECHNICIAN n\'accède pas aux fiches client directement' })
  @ApiResponse({ status: 404, description: 'Client introuvable' })
  findOne(@Param('id') id: string) {
    return this.clientsService.findOne(id);
  }

  /**
   * POST /api/clients
   * Crée un nouveau client avec ses adresses.
   */
  @Post()
  @Roles(Role.ADMIN, Role.DISPATCHER)
  @ApiOperation({
    summary: 'Créer un client',
    description: 'Crée le client et ses adresses en transaction. ' +
      'Si aucune adresse n\'est marquée comme default, la première le devient automatiquement.',
  })
  @ApiResponse({ status: 201, description: 'Client créé avec ses adresses' })
  @ApiResponse({ status: 400, description: 'Données invalides' })
  @ApiResponse({ status: 401, description: 'Non authentifié' })
  @ApiResponse({ status: 403, description: 'Accès réservé aux administrateurs et dispatchers' })
  create(@Body() dto: CreateClientDto) {
    return this.clientsService.create(dto);
  }

  /**
   * PATCH /api/clients/:id
   * Mise à jour partielle d'un client (hors adresses).
   */
  @Patch(':id')
  @Roles(Role.ADMIN, Role.DISPATCHER)
  @ApiOperation({
    summary: 'Modifier un client (mise à jour partielle)',
    description: 'Les adresses sont gérées via les routes /addresses dédiées.',
  })
  @ApiParam({ name: 'id', type: 'string', description: 'UUID du client' })
  @ApiResponse({ status: 200, description: 'Client mis à jour' })
  @ApiResponse({ status: 400, description: 'Données invalides' })
  @ApiResponse({ status: 401, description: 'Non authentifié' })
  @ApiResponse({ status: 403, description: 'Accès réservé aux administrateurs et dispatchers' })
  @ApiResponse({ status: 404, description: 'Client introuvable' })
  update(@Param('id') id: string, @Body() dto: UpdateClientDto) {
    return this.clientsService.update(id, dto);
  }

  /**
   * DELETE /api/clients/:id
   * Désactive un client (soft delete — isActive = false).
   * Échoue si des bons de travail actifs sont liés au client.
   */
  @Delete(':id')
  @Roles(Role.ADMIN, Role.DISPATCHER)
  @ApiOperation({
    summary: 'Désactiver un client (soft delete)',
    description:
      'Passe isActive à false. Échoue avec 409 si des bons de travail ' +
      'actifs (non terminés) sont liés au client.',
  })
  @ApiParam({ name: 'id', type: 'string', description: 'UUID du client' })
  @ApiResponse({ status: 200, description: 'Client désactivé' })
  @ApiResponse({ status: 401, description: 'Non authentifié' })
  @ApiResponse({ status: 403, description: 'Accès réservé aux administrateurs et dispatchers' })
  @ApiResponse({ status: 404, description: 'Client introuvable' })
  @ApiResponse({ status: 409, description: 'Des BT actifs sont liés à ce client' })
  softDelete(@Param('id') id: string) {
    return this.clientsService.softDelete(id);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Routes Adresses
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * POST /api/clients/:id/addresses
   * Ajoute une adresse au client.
   */
  @Post(':id/addresses')
  @Roles(Role.ADMIN, Role.DISPATCHER)
  @ApiOperation({
    summary: 'Ajouter une adresse au client',
    description:
      'Si isDefault=true, les autres adresses du client sont automatiquement passées à false.',
  })
  @ApiParam({ name: 'id', type: 'string', description: 'UUID du client' })
  @ApiResponse({ status: 201, description: 'Adresse créée' })
  @ApiResponse({ status: 400, description: 'Données invalides' })
  @ApiResponse({ status: 401, description: 'Non authentifié' })
  @ApiResponse({ status: 403, description: 'Accès réservé aux administrateurs et dispatchers' })
  @ApiResponse({ status: 404, description: 'Client introuvable' })
  addAddress(
    @Param('id') clientId: string,
    @Body() dto: CreateClientAddressDto,
  ) {
    return this.clientsService.addAddress(clientId, dto);
  }

  /**
   * PATCH /api/clients/:id/addresses/:addressId
   * Mise à jour partielle d'une adresse.
   */
  @Patch(':id/addresses/:addressId')
  @Roles(Role.ADMIN, Role.DISPATCHER)
  @ApiOperation({
    summary: 'Modifier une adresse (mise à jour partielle)',
    description:
      'Vérifie que l\'adresse appartient au client. ' +
      'Si isDefault=true, les autres adresses sont passées à false.',
  })
  @ApiParam({ name: 'id',        type: 'string', description: 'UUID du client' })
  @ApiParam({ name: 'addressId', type: 'string', description: 'UUID de l\'adresse' })
  @ApiResponse({ status: 200, description: 'Adresse mise à jour' })
  @ApiResponse({ status: 400, description: 'Données invalides' })
  @ApiResponse({ status: 401, description: 'Non authentifié' })
  @ApiResponse({ status: 403, description: 'Accès réservé aux administrateurs et dispatchers' })
  @ApiResponse({ status: 404, description: 'Client ou adresse introuvable' })
  updateAddress(
    @Param('id') clientId: string,
    @Param('addressId') addressId: string,
    @Body() dto: UpdateClientAddressDto,
  ) {
    return this.clientsService.updateAddress(clientId, addressId, dto);
  }

  /**
   * DELETE /api/clients/:id/addresses/:addressId
   * Supprime une adresse d'un client.
   */
  @Delete(':id/addresses/:addressId')
  @Roles(Role.ADMIN, Role.DISPATCHER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Supprimer une adresse',
    description:
      'Impossible de supprimer la dernière adresse d\'un client ou une adresse ' +
      'référencée par des bons de travail actifs.',
  })
  @ApiParam({ name: 'id',        type: 'string', description: 'UUID du client' })
  @ApiParam({ name: 'addressId', type: 'string', description: 'UUID de l\'adresse' })
  @ApiResponse({ status: 200, description: 'Adresse supprimée' })
  @ApiResponse({ status: 400, description: 'Dernière adresse — suppression interdite' })
  @ApiResponse({ status: 401, description: 'Non authentifié' })
  @ApiResponse({ status: 403, description: 'Accès réservé aux administrateurs et dispatchers' })
  @ApiResponse({ status: 404, description: 'Client ou adresse introuvable' })
  @ApiResponse({ status: 409, description: 'Des BT actifs référencent cette adresse' })
  deleteAddress(
    @Param('id') clientId: string,
    @Param('addressId') addressId: string,
  ) {
    return this.clientsService.deleteAddress(clientId, addressId);
  }
}
