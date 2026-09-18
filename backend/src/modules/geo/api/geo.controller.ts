import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../../../common/decorators/roles.decorator';
import { AddressLookupService } from '../application/address-lookup.service';
import { PropertyService } from '../application/property.service';
import { PropertyQueryDto, ResolveQueryDto, SuggestQueryDto } from './dto/geo-query.dto';

/**
 * Géo (B40) — autocomplétion d'adresse (Adresses Québec) et fiche propriété
 * (rôle d'évaluation foncière importé).
 */
@ApiTags('Geo')
@ApiBearerAuth('access-token')
@Controller('geo')
export class GeoController {
  constructor(
    private readonly lookup: AddressLookupService,
    private readonly properties: PropertyService,
  ) {}

  @Get('suggest')
  @Roles(Role.ADMIN, Role.DISPATCHER)
  @ApiOperation({ summary: "Suggestions d'adresses pendant la frappe (Adresses Québec)" })
  async suggest(@Query() query: SuggestQueryDto) {
    return { suggestions: await this.lookup.suggest(query.q) };
  }

  @Get('resolve')
  @Roles(Role.ADMIN, Role.DISPATCHER)
  @ApiOperation({ summary: 'Résout une suggestion en champs d’adresse + GPS' })
  async resolve(@Query() query: ResolveQueryDto) {
    return { address: await this.lookup.resolve(query.text, query.magicKey) };
  }

  @Get('property')
  @Roles(Role.ADMIN, Role.DISPATCHER, Role.TECHNICIAN)
  @ApiOperation({ summary: "Fiche propriété (rôle d'évaluation) d'une adresse" })
  async property(@Query() query: PropertyQueryDto) {
    if (query.addressId) {
      return { property: await this.properties.findForClientAddress(query.addressId) };
    }
    const hasCoords = query.latitude !== undefined && query.longitude !== undefined;
    if (!hasCoords && !(query.street && query.city)) {
      throw new BadRequestException(
        'Fournir addressId, ou latitude+longitude, ou street+city',
      );
    }
    return {
      property: await this.properties.find({
        latitude: query.latitude,
        longitude: query.longitude,
        streetNumber: query.streetNumber,
        street: query.street,
        city: query.city,
      }),
    };
  }
}
