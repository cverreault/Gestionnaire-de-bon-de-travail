/**
 * QA — roles-matrix.spec.ts
 *
 * Declarative permission-matrix regression test. For every sensitive
 * endpoint we list the expected authorized roles, then read the actual
 * @Roles() metadata via Reflector and assert they match.
 *
 * Goals:
 *  - Catch the exact Sprint-0 IDOR that shipped (GET /clients/:id was missing
 *    @Roles → leaked client data to TECHNICIAN). The first row of CLIENTS_MATRIX
 *    locks that fix in place.
 *  - Catch silent regressions: removing or widening a @Roles() decorator on
 *    a sensitive endpoint will fail the suite.
 *  - Run fast (~1s, no DB) — designed to live in CI and run on every push.
 *
 * Coverage policy:
 *  - We only assert the *authorized* role set. Endpoints with no @Roles()
 *    decorator are implicitly "any authenticated user" and *must* be
 *    explicit in this file with `expectedRoles: 'ANY'`.
 *  - Object-level RBAC (a TECHNICIAN can only see their *own* BT) is NOT
 *    covered here — it lives in the service layer and needs Prisma-backed
 *    tests. Those land separately.
 */

import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { ROLES_KEY } from '../decorators/roles.decorator';

import { WorkOrdersController } from '../../modules/work-orders/work-orders.controller';
import { ClientsController } from '../../modules/clients/clients.controller';
import { UsersController } from '../../modules/users/users.controller';
import { CalendarController } from '../../modules/calendar/calendar.controller';
import { AuditController } from '../../modules/audit/api/audit.controller';
import { BackupController } from '../../modules/backup/backup.controller';
import { SearchController } from '../../modules/search/api/search.controller';
import { NotificationsController } from '../../modules/notifications/api/notifications.controller';

// ─── Matrix rows ─────────────────────────────────────────────────────────────

type MatrixRow = {
  controller: new (...args: unknown[]) => unknown;
  method: string;
  /** Either the literal authorized role list, or 'ANY' for "no @Roles()" */
  expectedRoles: Role[] | 'ANY';
  /** Free-form note shown in the test name */
  note: string;
};

const WORK_ORDERS_MATRIX: MatrixRow[] = [
  { controller: WorkOrdersController, method: 'findAll',                 expectedRoles: 'ANY',                              note: 'GET /work-orders — service filters by assignedToId for TECH' },
  { controller: WorkOrdersController, method: 'findOne',                 expectedRoles: 'ANY',                              note: 'GET /work-orders/:id — service enforces IDOR for TECH' },
  { controller: WorkOrdersController, method: 'getAvailableTransitions', expectedRoles: 'ANY',                              note: 'GET /:id/available-transitions — TECH sees their own' },
  { controller: WorkOrdersController, method: 'exportCsv',               expectedRoles: [Role.ADMIN, Role.DISPATCHER],      note: 'GET /work-orders/export.csv — A3' },
  { controller: WorkOrdersController, method: 'create',                  expectedRoles: [Role.ADMIN, Role.DISPATCHER],      note: 'POST /work-orders' },
  { controller: WorkOrdersController, method: 'duplicate',               expectedRoles: [Role.ADMIN, Role.DISPATCHER],      note: 'POST /:id/duplicate — A7' },
  { controller: WorkOrdersController, method: 'update',                  expectedRoles: 'ANY',                              note: 'PATCH /work-orders/:id — service whitelists fields per role' },
  { controller: WorkOrdersController, method: 'assignAndDispatch',       expectedRoles: [Role.ADMIN, Role.DISPATCHER],      note: 'POST /:id/assign-and-dispatch' },
  { controller: WorkOrdersController, method: 'transition',              expectedRoles: 'ANY',                              note: 'POST /:id/transition — TECH transitions own BTs' },
  { controller: WorkOrdersController, method: 'findNotes',               expectedRoles: 'ANY',                              note: 'GET /:id/notes — same IDOR rule as the BT' },
  { controller: WorkOrdersController, method: 'createNote',              expectedRoles: 'ANY',                              note: 'POST /:id/notes — assignee or admin' },
];

const CLIENTS_MATRIX: MatrixRow[] = [
  // 🚨 Sprint-0 IDOR fix — this row locks it in.
  { controller: ClientsController, method: 'findOne',                expectedRoles: [Role.ADMIN, Role.DISPATCHER], note: 'GET /clients/:id — Sprint-0 IDOR FIX' },
  { controller: ClientsController, method: 'findAll',                expectedRoles: [Role.ADMIN, Role.DISPATCHER], note: 'GET /clients' },
  { controller: ClientsController, method: 'create',                 expectedRoles: [Role.ADMIN, Role.DISPATCHER], note: 'POST /clients' },
  { controller: ClientsController, method: 'searchUnified',          expectedRoles: [Role.ADMIN, Role.DISPATCHER], note: 'GET /clients/search' },
  { controller: ClientsController, method: 'findAllAddresses',       expectedRoles: [Role.ADMIN, Role.DISPATCHER], note: 'GET /clients/addresses/all' },
  { controller: ClientsController, method: 'createStandaloneAddress',expectedRoles: [Role.ADMIN, Role.DISPATCHER], note: 'POST /clients/addresses' },
  { controller: ClientsController, method: 'updateAddressById',      expectedRoles: [Role.ADMIN, Role.DISPATCHER], note: 'PATCH /clients/addresses/:id' },
  { controller: ClientsController, method: 'deleteAddressById',      expectedRoles: [Role.ADMIN, Role.DISPATCHER], note: 'DELETE /clients/addresses/:id' },
];

const USERS_MATRIX: MatrixRow[] = [
  { controller: UsersController, method: 'findAll',           expectedRoles: [Role.ADMIN],                      note: 'GET /users' },
  { controller: UsersController, method: 'findTechnicians',   expectedRoles: [Role.ADMIN, Role.DISPATCHER],     note: 'GET /users/technicians' },
  { controller: UsersController, method: 'findOne',           expectedRoles: [Role.ADMIN],                      note: 'GET /users/:id' },
  { controller: UsersController, method: 'create',            expectedRoles: [Role.ADMIN],                      note: 'POST /users' },
  { controller: UsersController, method: 'adminResetPassword', expectedRoles: [Role.ADMIN],                     note: 'PATCH /users/:id/reset-password' },
  { controller: UsersController, method: 'update',            expectedRoles: [Role.ADMIN],                      note: 'PATCH /users/:id' },
  { controller: UsersController, method: 'remove',            expectedRoles: [Role.ADMIN],                      note: 'DELETE /users/:id' },
  // /me/* endpoints are self-service for the current user — must stay open.
  { controller: UsersController, method: 'updateMyProfile',     expectedRoles: 'ANY', note: 'PATCH /users/me' },
  { controller: UsersController, method: 'getMyPreferences',    expectedRoles: 'ANY', note: 'GET /users/me/preferences' },
  { controller: UsersController, method: 'updateMyPreferences', expectedRoles: 'ANY', note: 'PATCH /users/me/preferences' },
  { controller: UsersController, method: 'changeMyPassword',    expectedRoles: 'ANY', note: 'PATCH /users/me/password' },
];

const CALENDAR_MATRIX: MatrixRow[] = [
  { controller: CalendarController, method: 'getEvents', expectedRoles: 'ANY',                              note: 'GET /calendar/events — service filters per role' },
  // 🚨 IDOR-protected by @Roles (calendar appointments may include sensitive client data)
  { controller: CalendarController, method: 'findOne',   expectedRoles: [Role.ADMIN, Role.DISPATCHER],      note: 'GET /calendar/appointments/:id — IDOR FIX' },
  { controller: CalendarController, method: 'create',    expectedRoles: [Role.ADMIN, Role.DISPATCHER],      note: 'POST /calendar/appointments' },
  { controller: CalendarController, method: 'update',    expectedRoles: [Role.ADMIN, Role.DISPATCHER],      note: 'PATCH /calendar/appointments/:id' },
  { controller: CalendarController, method: 'remove',    expectedRoles: [Role.ADMIN, Role.DISPATCHER],      note: 'DELETE /calendar/appointments/:id' },
];

const AUDIT_MATRIX: MatrixRow[] = [
  { controller: AuditController, method: 'findAll',           expectedRoles: [Role.ADMIN], note: 'GET /audit — admin only' },
  // CSV export shares the same gate as the JSON list — admin compliance only.
  { controller: AuditController, method: 'exportCsv',         expectedRoles: [Role.ADMIN], note: 'GET /audit/export.csv — admin only' },
  { controller: AuditController, method: 'getActivityStats', expectedRoles: [Role.ADMIN], note: 'GET /audit/stats — dashboard rollup' },
  // A6 — TECHNICIAN allowed at the route level; service enforces object-level RBAC
  // (technicians can only read the timeline of BTs they are assigned to).
  { controller: AuditController, method: 'findForAggregate', expectedRoles: 'ANY',       note: 'GET /audit/aggregate/:id — A6, object-level RBAC in service' },
];

const SEARCH_MATRIX: MatrixRow[] = [
  { controller: SearchController, method: 'search', expectedRoles: [Role.ADMIN, Role.DISPATCHER], note: 'GET /search — dispatcher top-bar (TECH not exposed)' },
];

const NOTIFICATIONS_MATRIX: MatrixRow[] = [
  // Inbox endpoints are self-service for the current user — no @Roles().
  // Object-level RBAC happens in the service (userId from JWT vs row.userId).
  { controller: NotificationsController, method: 'findMine',    expectedRoles: 'ANY', note: 'GET /me/notifications' },
  { controller: NotificationsController, method: 'markRead',    expectedRoles: 'ANY', note: 'PATCH /me/notifications/:id/read' },
  { controller: NotificationsController, method: 'markAllRead', expectedRoles: 'ANY', note: 'PATCH /me/notifications/read-all' },
];

const BACKUP_MATRIX: MatrixRow[] = [
  // Backup controller has class-level @Roles(ADMIN) — every method inherits.
  { controller: BackupController, method: 'info',    expectedRoles: [Role.ADMIN], note: 'GET /backup/info' },
  { controller: BackupController, method: 'export',  expectedRoles: [Role.ADMIN], note: 'GET /backup/export' },
  { controller: BackupController, method: 'restore', expectedRoles: [Role.ADMIN], note: 'POST /backup/restore' },
];

const ALL_ROWS: { name: string; rows: MatrixRow[] }[] = [
  { name: 'WorkOrdersController', rows: WORK_ORDERS_MATRIX },
  { name: 'ClientsController',    rows: CLIENTS_MATRIX },
  { name: 'UsersController',      rows: USERS_MATRIX },
  { name: 'CalendarController',   rows: CALENDAR_MATRIX },
  { name: 'AuditController',      rows: AUDIT_MATRIX },
  { name: 'BackupController',     rows: BACKUP_MATRIX },
  { name: 'SearchController',     rows: SEARCH_MATRIX },
  { name: 'NotificationsController', rows: NOTIFICATIONS_MATRIX },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

const reflector = new Reflector();

/**
 * Mirrors RolesGuard.canActivate's metadata lookup so a class-level
 * @Roles() (as on BackupController) is correctly inherited.
 */
function readRoles(row: MatrixRow): Role[] | undefined {
  const handler = (row.controller.prototype as Record<string, unknown>)[row.method];
  if (typeof handler !== 'function') {
    throw new Error(`Method ${row.method} not found on ${row.controller.name}`);
  }
  return reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
    handler as () => unknown,
    row.controller,
  ]);
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Permission matrix (@Roles metadata)', () => {
  for (const { name, rows } of ALL_ROWS) {
    describe(name, () => {
      for (const row of rows) {
        it(`${row.method} → ${row.note}`, () => {
          const actual = readRoles(row);

          if (row.expectedRoles === 'ANY') {
            // No @Roles() decorator → metadata is undefined or empty.
            expect(actual === undefined || actual.length === 0).toBe(true);
          } else {
            expect(actual).toBeDefined();
            expect(new Set(actual)).toEqual(new Set(row.expectedRoles));
          }
        });
      }
    });
  }

  it('every controller method we assert about actually exists', () => {
    for (const { rows } of ALL_ROWS) {
      for (const row of rows) {
        const handler = (row.controller.prototype as Record<string, unknown>)[row.method];
        expect(typeof handler).toBe('function');
      }
    }
  });
});
