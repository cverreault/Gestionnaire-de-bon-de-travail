import {
  Controller,
  Get,
  Put,
  Delete,
  Param,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../../../common/decorators/roles.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { SystemConfigService } from '../application/system-config.service';
import { UpsertConfigDto } from './dto/upsert-config.dto';
import {
  SYSTEM_CONFIG_EVENTS,
  systemConfigChanged,
} from '../events/system-config-events';

interface JwtUser {
  id: string;
  role: Role;
}

/**
 * Super-admin endpoints (SA.2.a).
 *
 * Gated to SUPER_ADMIN only. Even though RolesGuard treats SUPER_ADMIN
 * as a tier above ADMIN (passes ADMIN-gated endpoints), the explicit
 * @Roles(SUPER_ADMIN) here KEEPS regular ADMINs OUT — the inheritance
 * runs one way.
 */
@ApiTags('SuperAdmin')
@ApiBearerAuth('access-token')
@Roles(Role.SUPER_ADMIN)
@Controller('super-admin/configs')
export class SuperAdminController {
  constructor(
    private readonly configs: SystemConfigService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Liste les configs persistées en DB (métadonnées seulement, jamais les valeurs)',
    description: 'Renvoie `{ items, encryptionAvailable }`. `items` ne contient JAMAIS la valeur — utiliser GET /:key pour lire.',
  })
  async list() {
    const items = await this.configs.list();
    return {
      items,
      encryptionAvailable: this.configs.isEncryptionAvailable(),
    };
  }

  @Get(':key')
  @ApiOperation({
    summary: 'Récupère la valeur résolue (DB > env)',
    description:
      'Pour les configs chiffrées, le serveur déchiffre avant de renvoyer. ' +
      'Retourne `{ value: null, source: "unset" }` avec un 200 si la clé n\'est ni en DB ni en env — ' +
      'un 404 serait sémantiquement correct mais pollue la console du navigateur pour un cas ' +
      'très courant (config vide au premier boot).',
  })
  @ApiParam({ name: 'key', description: 'ex: smtp.host, vapid.public-key, audit.retentionDays' })
  async getOne(@Param('key') key: string) {
    const value = await this.configs.resolve(key);
    const dbRow = await this.configs.list();
    const meta = dbRow.find((r) => r.key === key);

    if (value === undefined) {
      return {
        key,
        value: null,
        source: 'unset' as const,
        encrypted: false,
        updatedAt: null,
        updatedBy: null,
      };
    }
    return {
      key,
      value,
      source: meta ? 'db' : 'env',
      encrypted: meta?.encrypted ?? false,
      updatedAt: meta?.updatedAt ?? null,
      updatedBy: meta?.updatedBy ?? null,
    };
  }

  @Put(':key')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Met à jour une config (upsert)',
    description: 'Si `encrypted=true`, la valeur est chiffrée avant insertion. Refuse si CONFIG_MASTER_KEY n\'est pas défini.',
  })
  @ApiParam({ name: 'key' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 400, description: 'Chiffrement demandé mais CONFIG_MASTER_KEY indisponible' })
  async upsert(
    @Param('key') key: string,
    @Body() body: UpsertConfigDto,
    @CurrentUser() user: JwtUser,
  ) {
    await this.configs.set(key, body.value, {
      encrypted: body.encrypted,
      updatedBy: user.id,
    });
    // Notify consumers (push channel, future others) that they should
    // re-read their config. Fire-and-forget — listener failure must not
    // block the write.
    this.eventEmitter.emit(
      SYSTEM_CONFIG_EVENTS.CHANGED,
      systemConfigChanged(key, user.id),
    );
    return { key, encrypted: body.encrypted ?? false };
  }

  @Delete(':key')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Supprime la config en DB',
    description: 'Le fallback vers `process.env` (si présent) redevient actif après suppression.',
  })
  @ApiParam({ name: 'key' })
  async remove(@Param('key') key: string, @CurrentUser() user: JwtUser) {
    await this.configs.delete(key);
    this.eventEmitter.emit(
      SYSTEM_CONFIG_EVENTS.CHANGED,
      systemConfigChanged(key, user.id),
    );
    return { key, removed: true };
  }
}
