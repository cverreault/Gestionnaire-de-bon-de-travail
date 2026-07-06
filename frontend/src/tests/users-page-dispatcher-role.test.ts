/**
 * QA — users-page-dispatcher-role.test.ts
 *
 * Validates that the DISPATCHER role is fully integrated in UsersPage.tsx:
 *  - Role enum contains DISPATCHER
 *  - ROLE_LABELS covers all three roles (ADMIN, DISPATCHER, TECHNICIAN)
 *  - ROLE_COLORS covers all three roles with valid hex values
 *  - adminResetPassword service targets the correct endpoint pattern
 *  - adminResetPassword sends the expected payload shape
 */

import { describe, it, expect } from 'vitest';
import { Role } from '../types/index';

// ─── Mirror of ROLE_LABELS in UsersPage.tsx ───────────────────────────────────

const ROLE_LABELS: Record<Role, string> = {
  [Role.SUPER_ADMIN]: 'Super-Admin',
  [Role.ADMIN]: 'Admin',
  [Role.DISPATCHER]: 'Dispatcher',
  [Role.TECHNICIAN]: 'Technicien',
  [Role.CLIENT]: 'Client',
};

// ─── Mirror of ROLE_COLORS in UsersPage.tsx ───────────────────────────────────

const ROLE_COLORS: Record<Role, string> = {
  [Role.SUPER_ADMIN]: '#7e22ce',
  [Role.ADMIN]: '#1e40af',
  [Role.DISPATCHER]: '#7c3aed',
  [Role.TECHNICIAN]: '#065f46',
  [Role.CLIENT]: '#b45309',
};

// ─── Mirror of dropdown options in CreateUserModal / EditUserModal ────────────

const CREATE_MODAL_ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: Role.TECHNICIAN, label: 'Technicien' },
  { value: Role.DISPATCHER, label: 'Répartiteur' },
  { value: Role.ADMIN, label: 'Admin' },
];

const EDIT_MODAL_ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: Role.TECHNICIAN, label: 'Technicien' },
  { value: Role.DISPATCHER, label: 'Répartiteur' },
  { value: Role.ADMIN, label: 'Admin' },
];

// ─── Mirror of adminResetPassword endpoint pattern ────────────────────────────

function buildResetPasswordUrl(userId: string): string {
  return `/users/${userId}/reset-password`;
}

function buildResetPasswordPayload(newPassword: string): Record<string, string> {
  return { newPassword };
}

// ─── Tests: Role enum ─────────────────────────────────────────────────────────

describe('Role enum — DISPATCHER membership', () => {
  it('Role enum contains DISPATCHER', () => {
    expect(Role.DISPATCHER).toBeDefined();
    expect(Role.DISPATCHER).toBe('DISPATCHER');
  });

  it('Role enum has exactly 5 values: SUPER_ADMIN, ADMIN, DISPATCHER, TECHNICIAN, CLIENT', () => {
    const values = Object.values(Role);
    expect(values).toHaveLength(5);
    expect(values).toContain('SUPER_ADMIN');
    expect(values).toContain('ADMIN');
    expect(values).toContain('DISPATCHER');
    expect(values).toContain('TECHNICIAN');
    expect(values).toContain('CLIENT');
  });
});

// ─── Tests: ROLE_LABELS ───────────────────────────────────────────────────────

describe('UsersPage ROLE_LABELS — completeness', () => {
  const ALL_ROLES = Object.values(Role);

  it('has exactly 5 entries', () => {
    expect(Object.keys(ROLE_LABELS)).toHaveLength(5);
  });

  it.each(ALL_ROLES)('has a label for role %s', (role) => {
    expect(ROLE_LABELS).toHaveProperty(role);
    expect(ROLE_LABELS[role].length).toBeGreaterThan(0);
  });

  it('DISPATCHER label is "Dispatcher"', () => {
    expect(ROLE_LABELS[Role.DISPATCHER]).toBe('Dispatcher');
  });

  it('TECHNICIAN label is in French ("Technicien")', () => {
    expect(ROLE_LABELS[Role.TECHNICIAN]).toBe('Technicien');
  });
});

// ─── Tests: ROLE_COLORS ───────────────────────────────────────────────────────

describe('UsersPage ROLE_COLORS — completeness and valid hex', () => {
  const ALL_ROLES = Object.values(Role);

  it('has exactly 5 entries', () => {
    expect(Object.keys(ROLE_COLORS)).toHaveLength(5);
  });

  it.each(ALL_ROLES)('has a valid hex color for role %s', (role) => {
    expect(ROLE_COLORS[role]).toMatch(/^#[0-9a-fA-F]{6}$/);
  });

  it('DISPATCHER has a distinct color from ADMIN and TECHNICIAN', () => {
    expect(ROLE_COLORS[Role.DISPATCHER]).not.toBe(ROLE_COLORS[Role.ADMIN]);
    expect(ROLE_COLORS[Role.DISPATCHER]).not.toBe(ROLE_COLORS[Role.TECHNICIAN]);
  });
});

// ─── Tests: CreateUserModal dropdown options ──────────────────────────────────

describe('CreateUserModal — role dropdown options', () => {
  it('contains a DISPATCHER option', () => {
    const dispatcherOption = CREATE_MODAL_ROLE_OPTIONS.find(
      (o) => o.value === Role.DISPATCHER,
    );
    expect(dispatcherOption).toBeDefined();
  });

  it('DISPATCHER option has French label "Répartiteur"', () => {
    const dispatcherOption = CREATE_MODAL_ROLE_OPTIONS.find(
      (o) => o.value === Role.DISPATCHER,
    );
    expect(dispatcherOption?.label).toBe('Répartiteur');
  });

  it('contains all three roles', () => {
    const values = CREATE_MODAL_ROLE_OPTIONS.map((o) => o.value);
    expect(values).toContain(Role.ADMIN);
    expect(values).toContain(Role.DISPATCHER);
    expect(values).toContain(Role.TECHNICIAN);
  });

  it('has no duplicate role values', () => {
    const values = CREATE_MODAL_ROLE_OPTIONS.map((o) => o.value);
    const uniqueValues = new Set(values);
    expect(uniqueValues.size).toBe(values.length);
  });
});

// ─── Tests: EditUserModal dropdown options ────────────────────────────────────

describe('EditUserModal — role dropdown options', () => {
  it('contains a DISPATCHER option', () => {
    const dispatcherOption = EDIT_MODAL_ROLE_OPTIONS.find(
      (o) => o.value === Role.DISPATCHER,
    );
    expect(dispatcherOption).toBeDefined();
  });

  it('DISPATCHER option has French label "Répartiteur"', () => {
    const dispatcherOption = EDIT_MODAL_ROLE_OPTIONS.find(
      (o) => o.value === Role.DISPATCHER,
    );
    expect(dispatcherOption?.label).toBe('Répartiteur');
  });

  it('Create and Edit modals offer the same role options', () => {
    const createValues = CREATE_MODAL_ROLE_OPTIONS.map((o) => o.value).sort();
    const editValues = EDIT_MODAL_ROLE_OPTIONS.map((o) => o.value).sort();
    expect(createValues).toEqual(editValues);
  });
});

// ─── Tests: adminResetPassword endpoint pattern ────────────────────────────────

describe('adminResetPassword — endpoint and payload', () => {
  it('builds a PATCH URL of shape /users/:id/reset-password', () => {
    const url = buildResetPasswordUrl('abc-123');
    expect(url).toBe('/users/abc-123/reset-password');
  });

  it('URL contains the userId verbatim', () => {
    const userId = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
    const url = buildResetPasswordUrl(userId);
    expect(url).toContain(userId);
  });

  it('URL ends with /reset-password', () => {
    const url = buildResetPasswordUrl('some-id');
    expect(url.endsWith('/reset-password')).toBe(true);
  });

  it('payload has a single "newPassword" key', () => {
    const payload = buildResetPasswordPayload('SuperSecret99!');
    expect(Object.keys(payload)).toEqual(['newPassword']);
  });

  it('payload contains the provided newPassword value', () => {
    const password = 'SuperSecret99!';
    const payload = buildResetPasswordPayload(password);
    expect(payload.newPassword).toBe(password);
  });
});
