import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { Scope } from '../../common/decorators/scope.decorator';
import { PublicApiThrottle } from './public-api-throttle.decorator';
import { ClientsService } from '../clients/clients.service';
import {
  CreateClientAddressDto,
  CreateClientDto,
} from '../clients/dto/create-client.dto';
import { UpdateClientDto } from '../clients/dto/update-client.dto';
import { UpdateClientAddressDto } from '../clients/dto/update-client-address.dto';
import { FindAllClientsDto } from '../clients/dto/search-client.dto';

/**
 * Public API v1 — Clients (B8).
 *
 * Delegates to `ClientsService` unchanged — none of the internal methods
 * accept a `currentUser` on this module, they're tenant-scoped through
 * the Prisma middleware which already picked up the tenant from
 * `ApiKeyAuthGuard.swapRequestTenant`.
 */
@ApiTags('Clients')
@ApiSecurity('api-key')
@PublicApiThrottle()
@Controller('v1/clients')
export class PublicClientsController {
  constructor(private readonly clients: ClientsService) {}

  @Get()
  @Scope('read-only')
  @ApiOperation({ summary: 'Lister les clients (pagination, filtres)' })
  list(@Query() query: FindAllClientsDto) {
    return this.clients.findAll(query);
  }

  @Get(':id')
  @Scope('read-only')
  @ApiOperation({ summary: 'Détail d\'un client (adresses + compteur BT)' })
  findOne(@Param('id') id: string) {
    return this.clients.findOne(id);
  }

  @Post()
  @Scope('read-write')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Créer un client (+ adresses optionnelles)' })
  create(@Body() dto: CreateClientDto) {
    return this.clients.create(dto);
  }

  @Patch(':id')
  @Scope('read-write')
  @ApiOperation({ summary: 'Modifier un client' })
  update(@Param('id') id: string, @Body() dto: UpdateClientDto) {
    return this.clients.update(id, dto);
  }

  @Delete(':id')
  @Scope('read-write')
  @ApiOperation({
    summary: 'Soft-delete un client (échoue si des BTs actifs y sont liés)',
  })
  softDelete(@Param('id') id: string) {
    return this.clients.softDelete(id);
  }

  @Post(':id/addresses')
  @Scope('read-write')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Ajouter une adresse à un client' })
  addAddress(
    @Param('id') clientId: string,
    @Body() dto: CreateClientAddressDto,
  ) {
    return this.clients.addAddress(clientId, dto);
  }

  @Patch(':id/addresses/:addressId')
  @Scope('read-write')
  @ApiOperation({ summary: 'Modifier une adresse d\'un client' })
  updateAddress(
    @Param('id') clientId: string,
    @Param('addressId') addressId: string,
    @Body() dto: UpdateClientAddressDto,
  ) {
    return this.clients.updateAddress(clientId, addressId, dto);
  }

  @Delete(':id/addresses/:addressId')
  @Scope('read-write')
  @ApiOperation({ summary: 'Supprimer une adresse d\'un client' })
  deleteAddress(
    @Param('id') clientId: string,
    @Param('addressId') addressId: string,
  ) {
    return this.clients.deleteAddress(clientId, addressId);
  }
}
