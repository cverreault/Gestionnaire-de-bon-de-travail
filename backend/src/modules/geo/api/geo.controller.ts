import { BadRequestException, Body, Controller, Get, HttpCode, HttpStatus, Post, Query, ServiceUnavailableException } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../../../common/decorators/roles.decorator';
import { AddressLookupService } from '../application/address-lookup.service';
import { PropertyService } from '../application/property.service';
import { PropertyQueryDto, ResolveQueryDto, SuggestQueryDto } from './dto/geo-query.dto';
import { RouteRequestDto } from './dto/route.dto';
import { ValhallaClient } from '../infrastructure/valhalla.client';

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
    private readonly router: ValhallaClient,
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

  // ── B47 — routage (Valhalla, OSM Québec) ─────────────────────────────────

  /** Itinéraire routier entre deux points : distance, durée, tracé, manœuvres. */
  @Post('route')
  @Roles(Role.ADMIN, Role.DISPATCHER, Role.TECHNICIAN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Itinéraire routier entre deux points (B47)' })
  async route(@Body() dto: RouteRequestDto) {
    const res = await this.router.route([dto.from, dto.to], { language: dto.language });
    if (!res) throw new ServiceUnavailableException('Moteur de routage indisponible');
    return res;
  }

  /** État du moteur de routage (tuiles prêtes ?). */
  @Get('router/status')
  @Roles(Role.ADMIN, Role.DISPATCHER)
  @ApiOperation({ summary: 'État du moteur de routage Valhalla (B47)' })
  routerStatus() {
    return this.router.status();
  }
}
