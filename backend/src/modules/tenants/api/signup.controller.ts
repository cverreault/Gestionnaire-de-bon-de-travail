import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../../common/decorators/public.decorator';
import { SignupService } from '../application/signup.service';
import { SignupDto } from './dto/signup.dto';

/**
 * Public POST /signup endpoint (B6.7).
 *
 * Anonymous — no JWT required. Aggressive throttle to make spam
 * signups expensive : 3 attempts per minute per IP. Captcha can be
 * layered on top in a future follow-up if needed.
 */
@ApiTags('Signup')
@Controller('signup')
export class SignupController {
  constructor(private readonly signup: SignupService) {}

  @Public()
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Throttle(
    process.env.THROTTLER_DISABLE === '1'
      ? { short: { ttl: 1000, limit: 1_000_000 } }
      : { short: { ttl: 60000, limit: 3 } },
  )
  @ApiOperation({
    summary: 'Créer un nouvel espace de travail (self-service)',
    description:
      'Crée un Tenant + son premier ADMIN + les seeds par défaut ' +
      '(process, types de tâches, types de clients, types d\'adresses). ' +
      'Tout dans une seule transaction.',
  })
  create(@Body() dto: SignupDto) {
    return this.signup.signup(dto);
  }
}
