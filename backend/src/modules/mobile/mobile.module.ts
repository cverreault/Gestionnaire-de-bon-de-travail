import { Global, Module } from '@nestjs/common';
import { IDEMPOTENCY_STORE } from '../../common/contracts/idempotency.contract';
import { MOBILE_PUSH_SENDER } from '../../common/contracts/mobile-push.contract';
import { DevicesController } from './api/devices.controller';
import { AdminDevicesController } from './api/admin-devices.controller';
import { UserSessionsRevokedDevicesListener } from './application/devices/user-sessions-revoked.listener';
import { MobileConfigController } from './api/mobile-config.controller';
import { SyncController } from './api/sync.controller';
import { MobileConfigService } from './application/config/mobile-config.service';
import { DevicesService } from './application/devices/devices.service';
import { IdempotencyStore } from './application/idempotency/idempotency.store';
import { SyncService } from './application/sync/sync.service';
import { MobileRepository } from './infrastructure/mobile.repository';
import { ExpoPushAdapter } from './infrastructure/expo-push.adapter';
import { MobilePushService } from './application/push/mobile-push.service';
import { MobileModuleRegistration } from './mobile.registration';

/**
 * Module `mobile` (B37) — surface backend de l'app technicien native.
 * B37.3 : registre des appareils ; B37.8 : configuration publique + porte de
 * version ; B37.5 : stockage des clés d'idempotence, lié au contrat
 * `IDEMPOTENCY_STORE` consommé par l'interceptor de `common/` depuis
 * n'importe quel contrôleur `@Idempotent()` — d'où `@Global()`.
 * B37.6 : tirage delta `GET /api/me/sync` (lectures directes documentées).
 * B37.4 : push natif Expo, lié au contrat `MOBILE_PUSH_SENDER` consommé par
 * `notifications` en `@Optional()`.
 */
@Global()
@Module({
  controllers: [DevicesController, AdminDevicesController, MobileConfigController, SyncController],
  providers: [
    DevicesService,
    UserSessionsRevokedDevicesListener,
    MobileConfigService,
    IdempotencyStore,
    MobileRepository,
    SyncService,
    { provide: IDEMPOTENCY_STORE, useExisting: IdempotencyStore },
    ExpoPushAdapter,
    MobilePushService,
    { provide: MOBILE_PUSH_SENDER, useExisting: MobilePushService },
    { provide: 'MOBILE_MODULE_REGISTRATION', useValue: MobileModuleRegistration },
  ],
  exports: [IDEMPOTENCY_STORE, MOBILE_PUSH_SENDER],
})
export class MobileModule {}
