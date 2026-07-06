import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsUUID } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';

export class CreatePortalInvitationDto {
  @ApiProperty({ description: 'UUID du client à inviter au portail' })
  @IsUUID('4', { message: i18nValidationMessage('validation.IS_UUID') })
  clientId: string;

  @ApiPropertyOptional({
    description:
      "Courriel de destination. Par défaut, le courriel de la fiche client.",
  })
  @IsOptional()
  @IsEmail({}, { message: i18nValidationMessage('validation.IS_EMAIL') })
  email?: string;
}
