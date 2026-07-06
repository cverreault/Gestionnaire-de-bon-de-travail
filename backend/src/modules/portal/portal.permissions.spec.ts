import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator';
import { PortalController } from './api/portal.controller';
import { PortalAdminController } from './api/portal-admin.controller';
import { WorkOrdersController } from '../work-orders/work-orders.controller';

/**
 * B21 — permission contract of the portal (CLAUDE.md rule 9).
 *
 * The RolesGuard grants access to ANY authenticated role when a route
 * has no @Roles metadata — so these tests pin the metadata itself:
 * every portal route must be CLIENT-only (or explicitly public for
 * activation), and the staff work-orders routes must NEVER be reachable
 * by a CLIENT.
 */
describe('Portal — permissions metadata', () => {
  const reflector = new Reflector();

  const rolesOf = (controller: object, method: string): Role[] | undefined =>
    reflector.get<Role[]>(
      ROLES_KEY,
      (controller as unknown as Record<string, () => void>)[method],
    );

  const isPublic = (controller: object, method: string): boolean | undefined =>
    reflector.get<boolean>(
      IS_PUBLIC_KEY,
      (controller as unknown as Record<string, () => void>)[method],
    );

  describe('PortalController (client-facing)', () => {
    const clientOnly = [
      'listWorkOrders',
      'getWorkOrder',
      'listAddresses',
      'listTaskTypes',
      'createWorkRequest',
    ];

    it.each(clientOnly)('%s is CLIENT-only', (method) => {
      expect(rolesOf(PortalController.prototype, method)).toEqual([Role.CLIENT]);
    });

    it('activate is public (no password yet) and has no roles', () => {
      expect(isPublic(PortalController.prototype, 'activate')).toBe(true);
      expect(rolesOf(PortalController.prototype, 'activate')).toBeUndefined();
    });
  });

  describe('PortalAdminController (staff-facing)', () => {
    it('invite is ADMIN-only', () => {
      expect(rolesOf(PortalAdminController.prototype, 'invite')).toEqual([
        Role.ADMIN,
      ]);
    });
  });

  describe('Staff work-orders routes are closed to CLIENT (B21 hardening)', () => {
    const staffMethods = [
      'findAll',
      'findOne',
      'create',
      'update',
    ];

    it.each(staffMethods)('%s excludes CLIENT', (method) => {
      const handler = (
        WorkOrdersController.prototype as unknown as Record<string, () => void>
      )[method];
      // Skip silently renamed handlers — the assertion below would throw
      // a clearer error than an undefined access.
      expect(handler).toBeDefined();
      const roles = rolesOf(WorkOrdersController.prototype, method);
      expect(roles).toBeDefined();
      expect(roles).not.toContain(Role.CLIENT);
    });
  });
});
