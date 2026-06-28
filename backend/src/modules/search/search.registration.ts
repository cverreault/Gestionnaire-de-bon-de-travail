import type { IModuleRegistration } from '../../common/contracts';

export const SearchModuleRegistration: IModuleRegistration = {
  moduleId: 'search',
  version: '1.0.0',
  type: 'core',
  dependsOn: ['work-orders', 'clients'],
  publishedEvents: [],
  consumedEvents: [],
};
