import type { IModuleRegistration } from '../../common/contracts';

/**
 * Métadonnées du module Audit — premier vrai consommateur des contrats
 * définis dans ADR-007.
 *
 * Sera collecté plus tard par un `ModuleRegistryService` (sprint 2.5) qui
 * exposera /api/admin/modules pour la visibilité des modules actifs.
 */
export const AuditModuleRegistration: IModuleRegistration = {
  moduleId: 'audit',
  version: '1.0.0',
  type: 'core',
  dependsOn: ['users', 'work-orders'],
  publishedEvents: [],
  consumedEvents: [
    'workOrders.workOrder.created',
    'workOrders.workOrder.assigned',
    'workOrders.workOrder.dispatched',
    'workOrders.workOrder.statusChanged',
    'workOrders.workOrder.completed',
  ],
};
