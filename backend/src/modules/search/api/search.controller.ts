import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../../../common/decorators/roles.decorator';
import { SearchService } from '../application/search.service';
import { SearchQueryDto } from './dto/search-query.dto';

/**
 * Endpoint unifié de recherche : top-bar dispatcher.
 *
 * Volontairement ADMIN + DISPATCHER seulement. Le TECHNICIAN ne voit pas la
 * top-bar côté UI et n'a pas besoin d'une vue d'ensemble des BT.
 */
@ApiTags('Search')
@ApiBearerAuth('access-token')
@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  @Roles(Role.ADMIN, Role.DISPATCHER)
  @ApiOperation({
    summary: 'Recherche globale (BT + clients + adresses)',
    description:
      'Cherche en parallèle dans : work_orders (référence, titre, ' +
      'nom client), clients (prénom, nom, entreprise, email, téléphone), ' +
      'client_addresses (rue, ville, code postal, étiquette). ' +
      'Max 10 résultats par type, donc 30 hits max. ' +
      'Renvoie un format unifié { type, id, title, subtitle, url }.',
  })
  @ApiResponse({ status: 200, description: 'Liste fusionnée des hits' })
  @ApiResponse({ status: 403, description: 'Réservé ADMIN/DISPATCHER' })
  search(@Query() query: SearchQueryDto) {
    return this.searchService.search(query.q);
  }
}
