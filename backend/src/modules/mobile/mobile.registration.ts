import type { IModuleRegistration } from '../../common/contracts';
import { MOBILE_DEVICE_REGISTERED_EVENT, MOBILE_DEVICE_REVOKED_EVENT } from '../../common/contracts/mobile-events.contract';

/** Surface module of the native technician app — see docs/modules/mobile.md. */
export const MobileModuleRegistration: IModuleRegistration = {
  moduleId: 'mobile',
  version: '0.1.0',
  type: 'core',
  dependsOn: ['users'],
  publishedEvents: [MOBILE_DEVICE_REGISTERED_EVENT, MOBILE_DEVICE_REVOKED_EVENT],
  consumedEvents: [],
};
