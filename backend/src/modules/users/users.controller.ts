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
import { Throttle } from '@nestjs/throttler';
import { Role } from '@prisma/client';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { AdminResetPasswordDto } from './dto/admin-reset-password.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Users')
@ApiBearerAuth('access-token')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // ── GET /api/users ─────────────────────────────────────────────────────────

  @Get()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: '[Admin] Liste tous les utilisateurs avec filtre optionnel par rôle' })
  @ApiQuery({ name: 'role', enum: Role, required: false, description: 'Filtrer par rôle' })
  @ApiResponse({ status: 200, description: 'Liste des utilisateurs', type: [UserResponseDto] })
  findAll(@Query('role') role?: Role) {
    return this.usersService.findAll(role);
  }

  // ── GET /api/users/technicians ─────────────────────────────────────────────
  // IMPORTANT : route statique déclarée AVANT la route paramétrée /:id
  // pour éviter que NestJS ne capture « technicians » comme valeur de :id.

  @Get('technicians')
  @Roles(Role.ADMIN, Role.DISPATCHER)
  @ApiOperation({ summary: '[Admin, Dispatcher] Liste des techniciens actifs (usage : assignation de BT)' })
  @ApiResponse({ status: 200, description: 'Liste des techniciens actifs', type: [UserResponseDto] })
  findTechnicians() {
    return this.usersService.findActiveTechnicians();
  }

  // ── GET /api/users/:id ─────────────────────────────────────────────────────

  @Get(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: '[Admin] Détail d\'un utilisateur' })
  @ApiParam({ name: 'id', type: 'string', description: 'UUID de l\'utilisateur' })
  @ApiResponse({ status: 200, description: 'Utilisateur trouvé', type: UserResponseDto })
  @ApiResponse({ status: 404, description: 'Utilisateur introuvable' })
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  // ── POST /api/users ────────────────────────────────────────────────────────

  @Post()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: '[Admin] Créer un utilisateur' })
  @ApiResponse({ status: 201, description: 'Utilisateur créé', type: UserResponseDto })
  @ApiResponse({ status: 409, description: 'Email déjà utilisé' })
  create(@Body() dto: CreateUserDto) {
    return this.usersService.create(dto);
  }

  // ── PATCH /api/users/me ────────────────────────────────────────────────────
  // IMPORTANT: déclarée AVANT PATCH /:id pour éviter que NestJS ne capture
  // « me » comme valeur de :id.

  @Patch('me')
  @ApiOperation({ summary: '[Tout utilisateur] Mettre à jour son propre profil (prénom, nom, téléphone)' })
  @ApiResponse({ status: 200, description: 'Profil mis à jour', type: UserResponseDto })
  @ApiResponse({ status: 400, description: 'Données invalides' })
  updateMyProfile(
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.usersService.updateProfile(userId, dto);
  }

  // ── GET /api/users/me/preferences ─────────────────────────────────────────
  @Get('me/preferences')
  @ApiOperation({ summary: 'Récupérer les préférences UI de l\'utilisateur courant' })
  @ApiResponse({ status: 200, description: 'Préférences (JSON libre)' })
  getMyPreferences(@CurrentUser('id') userId: string) {
    return this.usersService.getPreferences(userId);
  }

  // ── PATCH /api/users/me/preferences ───────────────────────────────────────
  @Patch('me/preferences')
  // Tight rate limit (C7bis) — 30 updates per minute is well above any
  // legitimate UI use and well below what a flood/scan would generate.
  @Throttle(
    process.env.THROTTLER_DISABLE === '1'
      ? { short: { ttl: 1000, limit: 1_000_000 } }
      : { short: { ttl: 60000, limit: 30 } },
  )
  @ApiOperation({ summary: 'Mettre à jour (merge) les préférences UI de l\'utilisateur courant' })
  @ApiResponse({ status: 200, description: 'Préférences mises à jour' })
  updateMyPreferences(
    @CurrentUser('id') userId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.usersService.updatePreferences(userId, body);
  }

  // ── PATCH /api/users/me/password ───────────────────────────────────────────
  // Route statique multi-segments — pas de conflit avec PATCH /:id
  // car le chemin « me/password » est distinct de « :id » (un seul segment).

  @Patch('me/password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '[Tout utilisateur] Changer son propre mot de passe' })
  @ApiResponse({ status: 204, description: 'Mot de passe modifié' })
  @ApiResponse({ status: 401, description: 'Mot de passe actuel incorrect' })
  async changeMyPassword(
    @CurrentUser('id') userId: string,
    @Body() dto: ChangePasswordDto,
  ) {
    await this.usersService.changePassword(
      userId,
      dto.currentPassword,
      dto.newPassword,
    );
  }

  // ── PATCH /api/users/:id/reset-password ───────────────────────────────────

  @Patch(':id/reset-password')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: '[Admin] Réinitialiser le mot de passe d\'un utilisateur' })
  @ApiParam({ name: 'id', type: 'string', description: 'UUID de l\'utilisateur' })
  @ApiResponse({ status: 200, description: 'Mot de passe réinitialisé avec succès' })
  @ApiResponse({ status: 404, description: 'Utilisateur introuvable' })
  adminResetPassword(
    @Param('id') id: string,
    @Body() dto: AdminResetPasswordDto,
  ) {
    return this.usersService.adminResetPassword(id, dto);
  }

  // ── PATCH /api/users/:id ───────────────────────────────────────────────────

  @Patch(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: '[Admin] Modifier un utilisateur' })
  @ApiParam({ name: 'id', type: 'string', description: 'UUID de l\'utilisateur' })
  @ApiResponse({ status: 200, description: 'Utilisateur modifié', type: UserResponseDto })
  @ApiResponse({ status: 404, description: 'Utilisateur introuvable' })
  @ApiResponse({ status: 409, description: 'Email déjà utilisé' })
  update(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.usersService.update(id, dto);
  }

  // ── DELETE /api/users/:id ──────────────────────────────────────────────────

  @Delete(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: '[Admin] Désactiver un utilisateur (soft delete — isActive = false)' })
  @ApiParam({ name: 'id', type: 'string', description: 'UUID de l\'utilisateur' })
  @ApiResponse({ status: 200, description: 'Utilisateur désactivé', type: UserResponseDto })
  @ApiResponse({ status: 404, description: 'Utilisateur introuvable' })
  remove(@Param('id') id: string) {
    return this.usersService.remove(id);
  }
}
