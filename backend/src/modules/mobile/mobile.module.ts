import { Module } from '@nestjs/common';
import { DevicesController } from './api/devices.controller';
import { MobileConfigController } from './api/mobile-config.controller';
import { MobileConfigService } from './application/config/mobile-config.service';
import { DevicesService } from './application/devices/devices.service';
import { MobileModuleRegistration } from './mobile.registration';

/**
 * Module `mobile` (B37) — surface backend de l'app technicien native.
 * B37.3 : registre des appareils ; B37.8 : configuration publique + porte de
 * version. Push (B37.4), idempotence (B37.5) et sync (B37.6) suivent.
 * `SystemConfigsModule` est `@Global()` : `SYSTEM_CONFIG_RESOLVER` est injectable ici.
 */
@Module({
  controllers: [DevicesController, MobileConfigController],
  providers: [
    DevicesService,
    MobileConfigService,
    { provide: 'MOBILE_MODULE_REGISTRATION', useValue: MobileModuleRegistration },
  ],
})
export class MobileModule {}
