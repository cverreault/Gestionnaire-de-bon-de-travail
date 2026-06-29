import {
  Controller,
  Post,
  Get,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiBody,
  ApiResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IsString, IsNotEmpty } from 'class-validator';
import { AuthService } from './auth.service';
import { EmailVerificationService } from './application/email-verification.service';
import { LoginDto } from './dto/login.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import type { TenantContext } from '../../common/contracts/tenant-context.contract';
import { UserResponseDto } from '../users/dto/user-response.dto';

class RefreshBodyDto {
  @IsString()
  @IsNotEmpty()
  refreshToken: string;
}

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly emailVerification: EmailVerificationService,
  ) {}

  // ── POST /api/auth/login ───────────────────────────────────────────────────

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle(
    process.env.THROTTLER_DISABLE === '1'
      ? { short: { ttl: 1000, limit: 1_000_000 } }
      : { short: { ttl: 60000, limit: 5 } },
  )
  @ApiOperation({ summary: 'Connexion — retourne access + refresh token' })
  @ApiResponse({
    status: 200,
    description: 'Connexion réussie',
    schema: {
      properties: {
        accessToken: { type: 'string' },
        refreshToken: { type: 'string' },
        user: { $ref: '#/components/schemas/UserResponseDto' },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Email ou mot de passe invalide' })
  login(
    @Body() dto: LoginDto,
    @CurrentTenant() tenant: TenantContext,
  ) {
    return this.authService.login(dto, tenant.id);
  }

  // ── POST /api/auth/refresh ─────────────────────────────────────────────────

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rotation des tokens — échange le refresh token contre de nouveaux tokens' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['refreshToken'],
      properties: { refreshToken: { type: 'string' } },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Nouveaux tokens émis',
    schema: {
      properties: {
        accessToken: { type: 'string' },
        refreshToken: { type: 'string' },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Refresh token invalide ou expiré' })
  refresh(@Body('refreshToken') refreshToken: string) {
    return this.authService.refresh(refreshToken);
  }

  // ── POST /api/auth/logout ──────────────────────────────────────────────────

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Déconnexion — invalide le refresh token côté serveur' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: { refreshToken: { type: 'string' } },
    },
  })
  @ApiResponse({ status: 204, description: 'Déconnexion réussie' })
  async logout(@Body('refreshToken') refreshToken: string) {
    await this.authService.logout(refreshToken);
  }

  // ── GET /api/auth/me ───────────────────────────────────────────────────────

  @Get('me')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Retourne le profil de l\'utilisateur authentifié' })
  @ApiResponse({ status: 200, description: 'Profil utilisateur', type: UserResponseDto })
  @ApiResponse({ status: 401, description: 'Non authentifié' })
  me(@CurrentUser() user: UserResponseDto) {
    return user;
  }

  // ── POST /api/auth/verify-email ────────────────────────────────────────────

  @Public()
  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Valider une adresse email via le lien reçu (B6.8)',
    description:
      'Le token est consommé une seule fois. Soft enforcement : ' +
      'l\'utilisateur peut continuer à utiliser TaskMgr même sans ' +
      'cliquer, mais une bannière s\'affiche tant que la vérification ' +
      'n\'est pas faite.',
  })
  @ApiResponse({ status: 200, description: 'Email vérifié' })
  @ApiResponse({ status: 400, description: 'Lien expiré ou déjà utilisé' })
  @ApiResponse({ status: 404, description: 'Lien inconnu' })
  async verifyEmail(@Body() dto: VerifyEmailDto) {
    const { userId } = await this.emailVerification.verify(dto.token);
    return { success: true, userId };
  }
}
