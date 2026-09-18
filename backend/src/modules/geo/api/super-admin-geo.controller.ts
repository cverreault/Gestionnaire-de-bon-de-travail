import {
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { IsInt, Max, Min } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { RollUpdateService } from '../application/roll-update.service';

class StartRollImportDto {
  @IsInt({ message: i18nValidationMessage('validation.IS_NUMBER') })
  @Min(2020, { message: i18nValidationMessage('validation.MIN') })
  @Max(2100, { message: i18nValidationMessage('validation.MAX') })
  year!: number;
}

/**
 * B40.3 — Référentiel géographique, portail super-admin : état du rôle
 * chargé, années disponibles chez le MAMH, lancement et suivi d'un import.
 * Adresses Québec est un service en ligne : rien à mettre à jour de ce côté.
 */
@ApiTags('SuperAdmin')
@ApiBearerAuth('access-token')
@Roles(Role.SUPER_ADMIN)
@Controller('super-admin/geo')
export class SuperAdminGeoController {
  constructor(private readonly rolls: RollUpdateService) {}

  @Get('status')
  @ApiOperation({ summary: "État du rôle d'évaluation chargé et dernier import" })
  status() {
    return this.rolls.status();
  }

  @Get('available')
  @ApiOperation({ summary: 'Années de rôle publiées par le MAMH (vérification en ligne)' })
  async available() {
    return { years: await this.rolls.availableYears() };
  }

  @Get('jobs')
  @ApiOperation({ summary: 'Derniers imports' })
  async jobs() {
    return { jobs: await this.rolls.recentJobs() };
  }

  @Get('jobs/:id')
  @ApiOperation({ summary: "Détail et journal d'un import" })
  async job(@Param('id', ParseUUIDPipe) id: string) {
    const job = await this.rolls.job(id);
    if (!job) throw new NotFoundException('Import introuvable');
    return job;
  }

  @Post('import')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: "Télécharger et importer le rôle d'une année (arrière-plan)" })
  async start(@CurrentUser() actor: { id: string }, @Body() dto: StartRollImportDto) {
    try {
      return await this.rolls.start(dto.year, actor.id);
    } catch (err) {
      throw new ConflictException(err instanceof Error ? err.message : String(err));
    }
  }
}
