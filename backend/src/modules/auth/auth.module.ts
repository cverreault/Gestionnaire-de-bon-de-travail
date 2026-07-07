import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { RefreshTokenCleanupService } from './refresh-token-cleanup.service';
import { SuperAdminBootstrapService } from './super-admin-bootstrap.service';
import { EmailVerificationService } from './application/email-verification.service';
import { TotpService } from './totp/totp.service';
import { TotpController } from './totp/totp.controller';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        secret: configService.getOrThrow<string>('JWT_SECRET'),
        signOptions: { expiresIn: '15m' },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController, TotpController],
  providers: [
    AuthService,
    JwtStrategy,
    RefreshTokenCleanupService,
    SuperAdminBootstrapService,
    EmailVerificationService,
    TotpService,
  ],
  /**
   * JwtModule est exporté pour que d'autres modules (ex. UsersModule)
   * puissent utiliser JwtService si besoin.
   * AuthService + EmailVerificationService sont exportés pour
   * permettre au SignupService (tenants) de générer le token tout de
   * suite après la création de l'admin.
   */
  exports: [
    AuthService,
    JwtModule,
    PassportModule,
    EmailVerificationService,
  ],
})
export class AuthModule {}
