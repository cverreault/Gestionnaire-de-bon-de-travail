import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../../../common/decorators/roles.decorator';
import { PortalInvitationService } from '../application/portal-invitation.service';
import { CreatePortalInvitationDto } from './dto/create-portal-invitation.dto';

/**
 * B21 — staff side of the portal: issue / resend invitations.
 * Revocation reuses PATCH /users/:id { isActive: false }.
 */
@ApiTags('Portal')
@ApiBearerAuth('access-token')
@Controller('portal/invitations')
export class PortalAdminController {
  constructor(private readonly invitations: PortalInvitationService) {}

  @Post()
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary:
      'Inviter un client au portail (crée le compte CLIENT + envoie le lien). Ré-appeler = renvoyer.',
  })
  invite(@Body() dto: CreatePortalInvitationDto) {
    return this.invitations.invite(dto);
  }
}
