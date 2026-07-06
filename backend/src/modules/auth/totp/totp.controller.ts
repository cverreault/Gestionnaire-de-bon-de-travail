import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { TotpService } from './totp.service';

class VerifyCodeDto {
  @IsString()
  @MinLength(6)
  code!: string;
}

class DisableDto {
  @IsString()
  @MinLength(1)
  currentPassword!: string;

  @IsString()
  @MinLength(6)
  code!: string;
}

/**
 * B14 — 2FA management endpoints.
 *
 * All routes are JWT-authenticated (the user must already be logged in
 * with password to enable/disable). Login itself uses a separate
 * `POST /auth/2fa/login-verify` in the auth controller.
 */
@ApiTags('2FA')
@ApiBearerAuth('access-token')
@Controller('auth/2fa')
export class TotpController {
  constructor(private readonly totp: TotpService) {}

  @Get('status')
  @ApiOperation({ summary: 'État du 2FA de l\'utilisateur courant' })
  async status(@CurrentUser() user: { id: string }) {
    const enabled = await this.totp.isEnabledForUser(user.id);
    return { enabled };
  }

  @Post('setup')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Démarrer la configuration 2FA — renvoie QR code + secret + codes de secours',
  })
  async setup(@CurrentUser() user: { id: string }) {
    return this.totp.beginSetup(user.id);
  }

  @Post('enable')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Activer le 2FA en fournissant le premier code TOTP' })
  async enable(@CurrentUser() user: { id: string }, @Body() dto: VerifyCodeDto) {
    if (!dto.code) throw new BadRequestException('Code requis');
    await this.totp.enable(user.id, dto.code);
    return { ok: true };
  }

  @Post('disable')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Désactiver le 2FA (mot de passe + code TOTP requis)',
  })
  async disable(@CurrentUser() user: { id: string }, @Body() dto: DisableDto) {
    await this.totp.disable(user.id, dto.currentPassword, dto.code);
    return { ok: true };
  }
}
