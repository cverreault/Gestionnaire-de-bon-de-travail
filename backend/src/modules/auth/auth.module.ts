import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { RefreshTokenCleanupService } from './refresh-token-cleanup.service';
import { SuperAdminBootstrapService } from './super-admin-bootstrap.service';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET', 'changeme-jwt-secret'),
        signOptions: { expiresIn: '15m' },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    RefreshTokenCleanupService,
    SuperAdminBootstrapService,
  ],
  /**
   * JwtModule est exporté pour que d'autres modules (ex. UsersModule)
   * puissent utiliser JwtService si besoin.
   * AuthService est exporté pour d'éventuels usages cross-module.
   */
  exports: [AuthService, JwtModule, PassportModule],
})
export class AuthModule {}
