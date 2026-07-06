import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Throttle } from '@nestjs/throttler';
import { Roles } from '../../../common/decorators/roles.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Public } from '../../../common/decorators/public.decorator';
import { PortalService, PortalUser } from '../application/portal.service';
import { PortalInvitationService } from '../application/portal-invitation.service';
import { CreateWorkRequestDto } from './dto/create-work-request.dto';
import { ActivatePortalAccountDto } from './dto/activate-portal-account.dto';

/**
 * B21 — client-facing portal API. Everything here is @Roles(CLIENT)
 * except /portal/activate (public — the user has no password yet).
 * Controllers return RAW values: the TransformInterceptor wraps them.
 */
@ApiTags('Portal')
@Controller('portal')
export class PortalController {
  constructor(
    private readonly portal: PortalService,
    private readonly invitations: PortalInvitationService,
  ) {}

  @Post('activate')
  @Public()
  @HttpCode(HttpStatus.OK)
  // Brute-force guard: tokens are 256-bit so this is belt-and-braces.
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: "Activer un compte portail (définir le mot de passe)" })
  activate(@Body() dto: ActivatePortalAccountDto) {
    return this.invitations.activate(dto.token, dto.password);
  }

  @Get('work-orders')
  @ApiBearerAuth('access-token')
  @Roles(Role.CLIENT)
  @ApiOperation({ summary: 'Mes bons de travail (vue client, champs restreints)' })
  listWorkOrders(@CurrentUser() user: PortalUser) {
    return this.portal.listWorkOrders(user);
  }

  @Get('work-orders/:id')
  @ApiBearerAuth('access-token')
  @Roles(Role.CLIENT)
  @ApiOperation({ summary: "Détail d'un de mes bons de travail" })
  getWorkOrder(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: PortalUser,
  ) {
    return this.portal.getWorkOrder(id, user);
  }

  @Get('addresses')
  @ApiBearerAuth('access-token')
  @Roles(Role.CLIENT)
  @ApiOperation({ summary: 'Mes adresses (pour le formulaire de demande)' })
  listAddresses(@CurrentUser() user: PortalUser) {
    return this.portal.listAddresses(user);
  }

  @Get('task-types')
  @ApiBearerAuth('access-token')
  @Roles(Role.CLIENT)
  @ApiOperation({ summary: 'Types de tâches actifs (pour le formulaire de demande)' })
  listTaskTypes() {
    return this.portal.listTaskTypes();
  }

  @Post('work-requests')
  @ApiBearerAuth('access-token')
  @Roles(Role.CLIENT)
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({
    summary:
      "Soumettre une demande de travail (crée un BT au statut « Demandé », à approuver)",
  })
  createWorkRequest(
    @Body() dto: CreateWorkRequestDto,
    @CurrentUser() user: PortalUser,
  ) {
    return this.portal.createWorkRequest(dto, user);
  }
}
