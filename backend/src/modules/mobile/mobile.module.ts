import { Global, Module } from '@nestjs/common';
import { IDEMPOTENCY_STORE } from '../../common/contracts/idempotency.contract';
import { DevicesController } from './api/devices.controller';
import { MobileConfigController } from './api/mobile-config.controller';
import { MobileConfigService } from './application/config/mobile-config.service';
import { DevicesService } from './application/devices/devices.service';
import { IdempotencyStore } from './application/idempotency/idempotency.store';
import { MobileModuleRegistration } from './mobile.registration';

/**
 * Module `mobile` (B37) — surface backend de l'app technicien native.
 * B37.3 : registre des appareils ; B37.8 : configuration publique + porte de
 * version ; B37.5 : stockage des clés d'idempotence, lié au contrat
 * `IDEMPOTENCY_STORE` consommé par l'interceptor de `common/` depuis
 * n'importe quel contrôleur `@Idempotent()` — d'où `@Global()`.
 * Push (B37.4) et sync (B37.6) suivent.
 */
@Global()
@Module({
  controllers: [DevicesController, MobileConfigController],
  providers: [
    DevicesService,
    MobileConfigService,
    IdempotencyStore,
    { provide: IDEMPOTENCY_STORE, useExisting: IdempotencyStore },
    { provide: 'MOBILE_MODULE_REGISTRATION', useValue: MobileModuleRegistration },
  ],
  exports: [IDEMPOTENCY_STORE],
})
export class MobileModule {}
