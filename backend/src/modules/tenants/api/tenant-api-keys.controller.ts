import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Role } from '@prisma/client';
import { i18nValidationMessage } from 'nestjs-i18n';
import { Roles } from '../../../common/decorators/roles.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import {
  ApiKeysService,
  type ApiKeyScope,
  VALID_SCOPES,
} from '../../api-keys/api-keys.service';

class CreateApiKeyDto {
  @IsString({ message: i18nValidationMessage('validation.IS_STRING') })
  @MinLength(1, { message: i18nValidationMessage('validation.MIN_LENGTH') })
  @MaxLength(80, { message: i18nValidationMessage('validation.MAX_LENGTH') })
  name!: string;

  @IsIn(VALID_SCOPES, {
    message: i18nValidationMessage('validation.IS_ENUM'),
  })
  scope!: ApiKeyScope;

  @IsOptional()
  @IsDateString(
    {},
    { message: i18nValidationMessage('validation.IS_DATE_STRING') },
  )
  expiresAt?: string;
}

/**
 * Admin CRUD for the tenant's own API keys (B8).
 *
 * ADMIN role — a tenant admin manages the integrations for their own
 * workspace. The plaintext key is returned in the POST response and
 * NEVER again : the UI surfaces it in a one-time modal.
 *
 * All operations are tenant-scoped automatically because the Prisma
 * middleware picks up the JWT tenant via the request context. No raw
 * SQL needed here — this endpoint runs in the normal JWT auth flow.
 */
@ApiTags('API keys')
@ApiBearerAuth('access-token')
@Roles(Role.ADMIN)
@Controller('tenant/api-keys')
export class TenantApiKeysController {
  constructor(private readonly apiKeys: ApiKeysService) {}

  @Get()
  @ApiOperation({ summary: 'Lister les clés API du tenant' })
  async list(
    @CurrentUser() actor: { tenantId: string },
  ): Promise<{ data: unknown[] }> {
    const rows = await this.apiKeys.list(actor.tenantId);
    return { data: rows };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Créer une clé API — le plaintext est retourné une seule fois',
  })
  async create(
    @CurrentUser() actor: { id: string; tenantId: string },
    @Body() dto: CreateApiKeyDto,
  ) {
    let expiresAt: Date | null = null;
    if (dto.expiresAt) {
      const d = new Date(dto.expiresAt);
      if (Number.isNaN(d.getTime())) {
        throw new BadRequestException('Date d\'expiration invalide');
      }
      if (d.getTime() <= Date.now()) {
        throw new BadRequestException(
          'La date d\'expiration doit être dans le futur',
        );
      }
      expiresAt = d;
    }
    return this.apiKeys.mint({
      tenantId: actor.tenantId,
      createdByUserId: actor.id,
      name: dto.name,
      scope: dto.scope,
      expiresAt,
    });
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Révoquer une clé API (irréversible)' })
  async revoke(
    @CurrentUser() actor: { id: string; tenantId: string },
    @Param('id') id: string,
  ) {
    await this.apiKeys.revoke(actor.tenantId, id, actor.id);
  }
}
