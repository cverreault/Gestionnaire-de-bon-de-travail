import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { IsString, Matches } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';
import { Roles } from '../../../common/decorators/roles.decorator';
import { SmsChannelService } from '../infrastructure/channels/sms-channel.service';

class TestSmsDto {
  @IsString({ message: i18nValidationMessage('validation.IS_STRING') })
  @Matches(/^\+?[0-9 ()-]{7,20}$/, {
    message: i18nValidationMessage('validation.IS_STRING'),
  })
  to: string;
}

/**
 * B22 — SA utility to validate the SMS integration end-to-end after
 * entering the Twilio credentials in the platform configuration.
 * Returns the channel's boolean verdict (raw — TransformInterceptor wraps).
 */
@ApiTags('Super Admin')
@ApiBearerAuth('access-token')
@Controller('super-admin/sms')
export class SmsAdminController {
  constructor(private readonly sms: SmsChannelService) {}

  @Post('test')
  @Roles(Role.SUPER_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Envoyer un SMS de test (valide la configuration Twilio)',
  })
  async test(@Body() dto: TestSmsDto) {
    const sent = await this.sms.send({
      to: dto.to.replace(/[ ()-]/g, ''),
      body: 'Dispatch2Go — SMS de test / test SMS. Configuration OK ✅',
    });
    return { sent };
  }
}
