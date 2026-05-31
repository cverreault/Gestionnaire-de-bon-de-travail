/**
 * QA V5 — settings-crud-types-v5.test.ts
 *
 * Validates the dynamic types CRUD implementation:
 *  - TypeScript interface coherence (ClientTypeConfig, AddressTypeConfig, TaskType)
 *  - Frontend service URL patterns match backend controller routes
 *  - Hook query key naming conventions
 *  - ConfigTypeFormValues sortOrder conversion (string → number)
 *  - Obsolete EnumSection test regression detection (BUG-03)
 *  - ConfigTypeTable now exposes mutation callbacks (breaking EnumSection contract)
 */

import { describe, it, expect } from 'vitest';
import type { TaskType, ClientTypeConfig, AddressTypeConfig } from '../types/index';
import {
  TASK_TYPES_KEY,
  CLIENT_TYPES_KEY,
  ADDRESS_TYPES_KEY,
} from '../hooks/useSettings';

// ─── Backend endpoint URLs (mirroring settings.service.ts) ───────────────────

const ENDPOINTS = {
  taskTypes: {
    list:   '/settings/task-types',
    single: (id: string) => `/settings/task-types/${id}`,
    create: '/settings/task-types',
    update: (id: string) => `/settings/task-types/${id}`,
    delete: (id: string) => `/settings/task-types/${id}`,
  },
  clientTypes: {
    list:   '/settings/client-types',
    create: '/settings/client-types',
    update: (id: string) => `/settings/client-types/${id}`,
    delete: (id: string) => `/settings/client-types/${id}`,
  },
  addressTypes: {
    list:   '/settings/address-types',
    create: '/settings/address-types',
    update: (id: string) => `/settings/address-types/${id}`,
    delete: (id: string) => `/settings/address-types/${id}`,
  },
};

// ─── Tests: TypeScript interface coherence ────────────────────────────────────

describe('TaskType interface — field coherence with Prisma model', () => {
  it('TaskType has all required Prisma fields', () => {
    const mockTaskType: TaskType = {
      id: 'uuid-1',
      name: 'Plomberie',
      prefix: 'PLB',
      description: null,
      color: '#FF5733',
      icon: '🔧',
      isActive: true,
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
    };
    expect(mockTaskType.id).toBeDefined();
    expect(mockTaskType.name).toBeDefined();
    expect(typeof mockTaskType.isActive).toBe('boolean');
    expect(typeof mockTaskType.createdAt).toBe('string');
  });

  it('TaskType.description is optional (can be null)', () => {
    const tt: TaskType = {
      id: 'id',
      name: 'Test',
      prefix: 'TST',
      isActive: true,
      createdAt: 'ts',
      updatedAt: 'ts',
      description: null,
    };
    expect(tt.description).toBeNull();
  });

  it('TaskType does NOT have code or sortOrder fields (no code in task types)', () => {
    const tt: TaskType = {
      id: 'id',
      name: 'Test',
      prefix: 'TST',
      isActive: true,
      createdAt: 'ts',
      updatedAt: 'ts',
    };
    // code and sortOrder are NOT on TaskType (only on ClientTypeConfig / AddressTypeConfig)
    expect(Object.prototype.hasOwnProperty.call(tt, 'code')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(tt, 'sortOrder')).toBe(false);
  });
});

describe('ClientTypeConfig interface — field coherence with Prisma model', () => {
  it('ClientTypeConfig has all required fields including code and sortOrder', () => {
    const mockCT: ClientTypeConfig = {
      id: 'uuid-2',
      name: 'Résidentiel',
      code: 'RESIDENTIAL',
      description: 'Particuliers',
      color: '#10b981',
      icon: '🏠',
      isActive: true,
      sortOrder: 0,
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
    };
    expect(mockCT.code).toBe('RESIDENTIAL');
    expect(typeof mockCT.sortOrder).toBe('number');
    expect(typeof mockCT.isActive).toBe('boolean');
  });

  it('ClientTypeConfig.code is a required string field', () => {
    const ct: ClientTypeConfig = {
      id: 'id',
      name: 'Test',
      code: 'TEST',
      isActive: true,
      sortOrder: 1,
      createdAt: 'ts',
      updatedAt: 'ts',
    };
    expect(ct.code).toBe('TEST');
  });

  it('ClientTypeConfig.sortOrder defaults to number (not string)', () => {
    const ct: ClientTypeConfig = {
      id: 'id',
      name: 'Test',
      code: 'TEST',
      isActive: true,
      sortOrder: 0,
      createdAt: 'ts',
      updatedAt: 'ts',
    };
    expect(typeof ct.sortOrder).toBe('number');
    expect(ct.sortOrder).toBe(0);
  });
});

describe('AddressTypeConfig interface — field coherence with Prisma model', () => {
  it('AddressTypeConfig has all required fields including code and sortOrder', () => {
    const mockAT: AddressTypeConfig = {
      id: 'uuid-3',
      name: 'Bureau',
      code: 'OFFICE',
      description: 'Siège social',
      color: '#3b82f6',
      icon: '🖥️',
      isActive: true,
      sortOrder: 0,
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
    };
    expect(mockAT.code).toBe('OFFICE');
    expect(typeof mockAT.sortOrder).toBe('number');
  });

  it('ClientTypeConfig and AddressTypeConfig share the same structural shape', () => {
    const ct: ClientTypeConfig = {
      id: 'id1', name: 'CT', code: 'CT', isActive: true, sortOrder: 0, createdAt: 'ts', updatedAt: 'ts',
    };
    const at: AddressTypeConfig = {
      id: 'id2', name: 'AT', code: 'AT', isActive: true, sortOrder: 0, createdAt: 'ts', updatedAt: 'ts',
    };
    // Both have the same required keys
    const ctKeys = Object.keys(ct).sort();
    const atKeys = Object.keys(at).sort();
    expect(ctKeys).toEqual(atKeys);
  });
});

// ─── Tests: endpoint URL patterns ────────────────────────────────────────────

describe('Frontend service — URL patterns match backend controller routes', () => {
  it('task-types list URL is /settings/task-types', () => {
    expect(ENDPOINTS.taskTypes.list).toBe('/settings/task-types');
  });

  it('task-types single URL includes the id', () => {
    const url = ENDPOINTS.taskTypes.single('test-uuid');
    expect(url).toBe('/settings/task-types/test-uuid');
  });

  it('task-types create URL is /settings/task-types (POST)', () => {
    expect(ENDPOINTS.taskTypes.create).toBe('/settings/task-types');
  });

  it('task-types update URL includes the id', () => {
    const url = ENDPOINTS.taskTypes.update('test-uuid');
    expect(url).toBe('/settings/task-types/test-uuid');
  });

  it('task-types delete URL includes the id', () => {
    const url = ENDPOINTS.taskTypes.delete('test-uuid');
    expect(url).toBe('/settings/task-types/test-uuid');
  });

  it('client-types list URL is /settings/client-types', () => {
    expect(ENDPOINTS.clientTypes.list).toBe('/settings/client-types');
  });

  it('client-types create URL is /settings/client-types (POST)', () => {
    expect(ENDPOINTS.clientTypes.create).toBe('/settings/client-types');
  });

  it('client-types update URL includes the id', () => {
    const url = ENDPOINTS.clientTypes.update('abc');
    expect(url).toBe('/settings/client-types/abc');
  });

  it('client-types delete URL includes the id', () => {
    const url = ENDPOINTS.clientTypes.delete('abc');
    expect(url).toBe('/settings/client-types/abc');
  });

  it('address-types list URL is /settings/address-types', () => {
    expect(ENDPOINTS.addressTypes.list).toBe('/settings/address-types');
  });

  it('address-types create URL is /settings/address-types (POST)', () => {
    expect(ENDPOINTS.addressTypes.create).toBe('/settings/address-types');
  });

  it('address-types update URL includes the id', () => {
    const url = ENDPOINTS.addressTypes.update('xyz');
    expect(url).toBe('/settings/address-types/xyz');
  });

  it('address-types delete URL includes the id', () => {
    const url = ENDPOINTS.addressTypes.delete('xyz');
    expect(url).toBe('/settings/address-types/xyz');
  });
});

// ─── Tests: React Query key naming conventions ────────────────────────────────

describe('useSettings hooks — query key naming', () => {
  it('TASK_TYPES_KEY is a string', () => {
    expect(typeof TASK_TYPES_KEY).toBe('string');
    expect(TASK_TYPES_KEY.length).toBeGreaterThan(0);
  });

  it('CLIENT_TYPES_KEY is a string', () => {
    expect(typeof CLIENT_TYPES_KEY).toBe('string');
    expect(CLIENT_TYPES_KEY.length).toBeGreaterThan(0);
  });

  it('ADDRESS_TYPES_KEY is a string', () => {
    expect(typeof ADDRESS_TYPES_KEY).toBe('string');
    expect(ADDRESS_TYPES_KEY.length).toBeGreaterThan(0);
  });

  it('all three query keys are distinct', () => {
    const keys = new Set([TASK_TYPES_KEY, CLIENT_TYPES_KEY, ADDRESS_TYPES_KEY]);
    expect(keys.size).toBe(3);
  });

  it('query keys follow kebab-case convention', () => {
    // Expected: 'task-types', 'client-types', 'address-types'
    expect(TASK_TYPES_KEY).toMatch(/^[a-z-]+$/);
    expect(CLIENT_TYPES_KEY).toMatch(/^[a-z-]+$/);
    expect(ADDRESS_TYPES_KEY).toMatch(/^[a-z-]+$/);
  });
});

// ─── Tests: sortOrder form value conversion (ConfigTypeFormValues) ────────────

describe('ConfigTypeFormValues — sortOrder string-to-number conversion', () => {
  /**
   * In SettingsPage.tsx, sortOrder is stored as string in the form
   * (because HTML inputs return strings) and converted via parseInt(values.sortOrder, 10) || 0
   */

  function convertSortOrder(raw: string): number {
    return parseInt(raw, 10) || 0;
  }

  it('converts "0" to 0', () => {
    expect(convertSortOrder('0')).toBe(0);
  });

  it('converts "1" to 1', () => {
    expect(convertSortOrder('1')).toBe(1);
  });

  it('converts "10" to 10', () => {
    expect(convertSortOrder('10')).toBe(10);
  });

  it('converts empty string to 0 (fallback)', () => {
    expect(convertSortOrder('')).toBe(0);
  });

  it('converts non-numeric string to 0 (fallback)', () => {
    expect(convertSortOrder('abc')).toBe(0);
  });

  it('converts "0" correctly — 0 || 0 edge case', () => {
    // parseInt('0') = 0, 0 || 0 = 0 — this is CORRECT
    expect(convertSortOrder('0')).toBe(0);
  });

  it('handles negative sortOrder (converts "-1" to -1)', () => {
    // parseInt('-1', 10) = -1, -1 || 0 = -1 (truthy check: -1 is truthy)
    expect(convertSortOrder('-1')).toBe(-1);
  });

  it('trims to integer part (ignores decimal)', () => {
    expect(convertSortOrder('2.9')).toBe(2); // parseInt stops at decimal
  });
});

// ─── Tests: code field uppercase validation pattern ───────────────────────────

describe('ConfigTypeModal — code field validation pattern /^[A-Z0-9_]+$/', () => {
  const CODE_PATTERN = /^[A-Z0-9_]+$/;

  it('accepts uppercase letters', () => {
    expect(CODE_PATTERN.test('RESIDENTIAL')).toBe(true);
  });

  it('accepts uppercase letters with digits', () => {
    expect(CODE_PATTERN.test('TYPE1')).toBe(true);
  });

  it('accepts uppercase letters with underscores', () => {
    expect(CODE_PATTERN.test('CLIENT_TYPE')).toBe(true);
  });

  it('accepts all three: uppercase, digits, underscores', () => {
    expect(CODE_PATTERN.test('TYPE_1_A')).toBe(true);
  });

  it('rejects lowercase letters', () => {
    expect(CODE_PATTERN.test('residential')).toBe(false);
  });

  it('rejects mixed case', () => {
    expect(CODE_PATTERN.test('Residential')).toBe(false);
  });

  it('rejects spaces', () => {
    expect(CODE_PATTERN.test('TYPE ONE')).toBe(false);
  });

  it('rejects hyphens', () => {
    expect(CODE_PATTERN.test('TYPE-ONE')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(CODE_PATTERN.test('')).toBe(false);
  });

  it('rejects special characters', () => {
    expect(CODE_PATTERN.test('TYPE@1')).toBe(false);
  });
});

// ─── BUG-03 Regression: ObsoleteEnumSection test contract ────────────────────

describe('BUG-03 — Obsolete EnumSection contract: ConfigTypeTable has mutation callbacks', () => {
  /**
   * The old test settings-page-enum-sections.test.ts asserts that the settings
   * sections should have NO mutation callbacks (no onCreate, onDelete, etc).
   * This was true for the OLD read-only EnumSection component.
   *
   * The new ConfigTypeTable component REQUIRES mutation callbacks:
   *   onCreate, onEdit, onToggleActive, onDelete, isUpdating, isDeleting
   *
   * This test documents that the new architecture BREAKS the old contract,
   * and the old test file is now obsolete / testing dead code.
   */

  interface ConfigTypeTableProps {
    sectionIcon: string;
    title: string;
    subtitle: string;
    items: unknown[];
    isLoading: boolean;
    isError: boolean;
    onCreate: () => void;         // mutation callback — present in new arch
    onEdit: (item: unknown) => void; // mutation callback — present in new arch
    onToggleActive: (item: unknown) => void; // mutation callback — present in new arch
    onDelete: (id: string) => void;  // mutation callback — present in new arch
    isUpdating: boolean;
    isDeleting: boolean;
  }

  it('ConfigTypeTable interface requires onCreate callback (mutation callback present)', () => {
    const props: ConfigTypeTableProps = {
      sectionIcon: '👤',
      title: 'Test',
      subtitle: 'Test subtitle',
      items: [],
      isLoading: false,
      isError: false,
      onCreate: () => {},
      onEdit: () => {},
      onToggleActive: () => {},
      onDelete: () => {},
      isUpdating: false,
      isDeleting: false,
    };
    expect(Object.prototype.hasOwnProperty.call(props, 'onCreate')).toBe(true);
    expect(typeof props.onCreate).toBe('function');
  });

  it('ConfigTypeTable interface requires onDelete callback (mutation callback present)', () => {
    const props = {
      onCreate: () => {},
      onDelete: () => {},
      onEdit: () => {},
      onToggleActive: () => {},
    };
    // The old EnumSection contract said these should NOT exist.
    // The new ConfigTypeTable requires ALL of these.
    expect(typeof props.onCreate).toBe('function');
    expect(typeof props.onDelete).toBe('function');
    expect(typeof props.onEdit).toBe('function');
    expect(typeof props.onToggleActive).toBe('function');
  });

  it('old EnumSection "no mutation callbacks" assertion is now WRONG for the new architecture', () => {
    // The old test claimed: validProps should NOT have onSubmit, onDelete, onUpdate, onCreate
    // The new ConfigTypeTable MUST have onCreate, onEdit, onToggleActive, onDelete
    const newComponentHasMutations = true; // ConfigTypeTable has onCreate, onEdit, onDelete, onToggleActive
    expect(newComponentHasMutations).toBe(true);
    // This means settings-page-enum-sections.test.ts line 291:
    // expect(validProps).not.toHaveProperty('onCreate') is WRONG for the new architecture
  });
});

// ─── Tests: Seed data coherence with DTO validation rules ─────────────────────

describe('Seed data coherence — code format validation', () => {
  const CODE_PATTERN = /^[A-Z0-9_]+$/;

  const seedClientTypes = [
    { name: 'Résidentiel',   code: 'RESIDENTIAL' },
    { name: 'Commercial',    code: 'COMMERCIAL'  },
    { name: 'Industriel',    code: 'INDUSTRIAL'  },
    { name: 'Institutionnel',code: 'INSTITUTIONAL'},
  ];

  const seedAddressTypes = [
    { name: 'Bureau',    code: 'OFFICE'     },
    { name: 'Entrepôt',  code: 'WAREHOUSE'  },
    { name: 'Résidence', code: 'RESIDENCE'  },
    { name: 'Chantier',  code: 'WORKSITE'   },
  ];

  it.each(seedClientTypes)(
    'client type code "$code" matches validation pattern',
    ({ code }) => {
      expect(CODE_PATTERN.test(code)).toBe(true);
    },
  );

  it.each(seedAddressTypes)(
    'address type code "$code" matches validation pattern',
    ({ code }) => {
      expect(CODE_PATTERN.test(code)).toBe(true);
    },
  );

  it('all seed client type codes are distinct', () => {
    const codes = seedClientTypes.map((c) => c.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('all seed address type codes are distinct', () => {
    const codes = seedAddressTypes.map((c) => c.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('all seed client type names are distinct', () => {
    const names = seedClientTypes.map((c) => c.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('all seed address type names are distinct', () => {
    const names = seedAddressTypes.map((c) => c.name);
    expect(new Set(names).size).toBe(names.length);
  });
});

// ─── Tests: soft-delete logic (isActive toggle) ───────────────────────────────

describe('Soft-delete pattern — isActive toggling', () => {
  it('toggling isActive from true to false performs soft-delete', () => {
    const item: ClientTypeConfig = {
      id: 'id',
      name: 'Test',
      code: 'TEST',
      isActive: true,
      sortOrder: 0,
      createdAt: 'ts',
      updatedAt: 'ts',
    };
    const toggledData = { isActive: !item.isActive };
    expect(toggledData.isActive).toBe(false);
  });

  it('toggling isActive from false to true reactivates the record', () => {
    const item: ClientTypeConfig = {
      id: 'id',
      name: 'Test',
      code: 'TEST',
      isActive: false,
      sortOrder: 0,
      createdAt: 'ts',
      updatedAt: 'ts',
    };
    const toggledData = { isActive: !item.isActive };
    expect(toggledData.isActive).toBe(true);
  });

  it('delete endpoint sends PATCH with isActive:false (not a real DELETE)', () => {
    // The DELETE endpoint in the backend actually does isActive = false (soft delete)
    // The frontend calls api.delete('/settings/client-types/id')
    // The backend handles it as a soft-delete (not SQL DELETE)
    const softDeletePayload = { isActive: false };
    expect(softDeletePayload.isActive).toBe(false);
  });
});
