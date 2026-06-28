/**
 * QA V5 — settings-dto-v5.spec.ts
 *
 * Validates DTO validation logic for the V5 Settings CRUD endpoints:
 *  - CreateTaskTypeDto: required name, optional fields, max lengths
 *  - CreateClientTypeDto: required name + code, code format regex, sortOrder type
 *  - CreateAddressTypeDto: same validation as ClientType
 *  - UpdateTaskTypeDto: all optional, isActive boolean
 *  - UpdateClientTypeDto / UpdateAddressTypeDto: same as Update pattern
 *  - BUG-04 (fixed): sortOrder has @IsInt() — non-numeric values are rejected
 *  - Color max length constraint (7 chars for #RRGGBB)
 *  - Code pattern: uppercase alphanumeric + underscore only
 */

import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateTaskTypeDto } from './dto/create-task-type.dto';
import { UpdateTaskTypeDto } from './dto/update-task-type.dto';
import { CreateClientTypeDto } from './dto/create-client-type.dto';
import { UpdateClientTypeDto } from './dto/update-client-type.dto';
import { CreateAddressTypeDto } from './dto/create-address-type.dto';
import { UpdateAddressTypeDto } from './dto/update-address-type.dto';

// ─── Helper ───────────────────────────────────────────────────────────────────

async function getErrors(DtoClass: new () => object, plain: object): Promise<string[]> {
  const instance = plainToInstance(DtoClass as new () => object, plain);
  const errors = await validate(instance as object);
  return errors.flatMap((e) => Object.values(e.constraints ?? {}));
}

// ─── CreateTaskTypeDto ────────────────────────────────────────────────────────

describe('CreateTaskTypeDto', () => {
  // prefix is now required (alphanumeric, max 10 chars) — it's used to build
  // BT reference numbers like "PLB-20260514-0001". Tests supply a valid one.
  const PREFIX = 'PLB';

  it('passes with name + prefix', async () => {
    const errors = await getErrors(CreateTaskTypeDto, { name: 'Plomberie', prefix: PREFIX });
    expect(errors).toHaveLength(0);
  });

  it('passes with all fields', async () => {
    const errors = await getErrors(CreateTaskTypeDto, {
      name: 'Électricité',
      prefix: 'ELEC',
      description: 'Travaux électriques',
      color: '#FF5733',
      icon: '⚡',
    });
    expect(errors).toHaveLength(0);
  });

  it('fails when name is missing', async () => {
    const errors = await getErrors(CreateTaskTypeDto, { prefix: PREFIX });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.toLowerCase().includes('name') || e.toLowerCase().includes('nom') || e.toLowerCase().includes('obligatoire') || e.toLowerCase().includes('empty'))).toBe(true);
  });

  it('fails when prefix is missing', async () => {
    const errors = await getErrors(CreateTaskTypeDto, { name: 'Test' });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.toLowerCase().includes('prefix'))).toBe(true);
  });

  it('fails when prefix contains a hyphen', async () => {
    const errors = await getErrors(CreateTaskTypeDto, { name: 'Test', prefix: 'PL-B' });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.toLowerCase().includes('alphanum'))).toBe(true);
  });

  it('fails when prefix exceeds 10 characters', async () => {
    const errors = await getErrors(CreateTaskTypeDto, { name: 'Test', prefix: 'A'.repeat(11) });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('fails when name is empty string', async () => {
    const errors = await getErrors(CreateTaskTypeDto, { name: '', prefix: PREFIX });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('fails when name exceeds 100 characters', async () => {
    const errors = await getErrors(CreateTaskTypeDto, { name: 'A'.repeat(101), prefix: PREFIX });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('passes when name is exactly 100 characters', async () => {
    const errors = await getErrors(CreateTaskTypeDto, { name: 'A'.repeat(100), prefix: PREFIX });
    expect(errors).toHaveLength(0);
  });

  it('fails when description exceeds 500 characters', async () => {
    const errors = await getErrors(CreateTaskTypeDto, {
      name: 'Test',
      prefix: PREFIX,
      description: 'D'.repeat(501),
    });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('passes when description is exactly 500 characters', async () => {
    const errors = await getErrors(CreateTaskTypeDto, {
      name: 'Test',
      prefix: PREFIX,
      description: 'D'.repeat(500),
    });
    expect(errors).toHaveLength(0);
  });

  it('fails when color exceeds 7 characters', async () => {
    const errors = await getErrors(CreateTaskTypeDto, {
      name: 'Test',
      prefix: PREFIX,
      color: '#FF57331', // 9 chars
    });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('passes when color is exactly 7 characters (#RRGGBB)', async () => {
    const errors = await getErrors(CreateTaskTypeDto, {
      name: 'Test',
      prefix: PREFIX,
      color: '#FF5733',
    });
    expect(errors).toHaveLength(0);
  });

  it('fails when icon exceeds 50 characters', async () => {
    const errors = await getErrors(CreateTaskTypeDto, {
      name: 'Test',
      prefix: PREFIX,
      icon: 'I'.repeat(51),
    });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('description is optional — omitting it is valid', async () => {
    const errors = await getErrors(CreateTaskTypeDto, { name: 'Test', prefix: PREFIX });
    expect(errors).toHaveLength(0);
  });
});

// ─── UpdateTaskTypeDto ────────────────────────────────────────────────────────

describe('UpdateTaskTypeDto', () => {
  it('passes with empty body (all fields optional)', async () => {
    const errors = await getErrors(UpdateTaskTypeDto, {});
    expect(errors).toHaveLength(0);
  });

  it('passes with only isActive field', async () => {
    const errors = await getErrors(UpdateTaskTypeDto, { isActive: false });
    expect(errors).toHaveLength(0);
  });

  it('passes with isActive: true', async () => {
    const errors = await getErrors(UpdateTaskTypeDto, { isActive: true });
    expect(errors).toHaveLength(0);
  });

  it('fails when isActive is not a boolean (string "true")', async () => {
    const errors = await getErrors(UpdateTaskTypeDto, { isActive: 'true' });
    // class-validator with @IsBoolean should reject string 'true'
    expect(errors.length).toBeGreaterThan(0);
  });

  it('fails when name is an empty string in update', async () => {
    const errors = await getErrors(UpdateTaskTypeDto, { name: '' });
    expect(errors.length).toBeGreaterThan(0);
  });
});

// ─── CreateClientTypeDto ─────────────────────────────────────────────────────

describe('CreateClientTypeDto', () => {
  it('passes with name and code', async () => {
    const errors = await getErrors(CreateClientTypeDto, {
      name: 'Résidentiel',
      code: 'RESIDENTIAL',
    });
    expect(errors).toHaveLength(0);
  });

  it('passes with all fields', async () => {
    const errors = await getErrors(CreateClientTypeDto, {
      name: 'Commercial',
      code: 'COMMERCIAL',
      description: 'Entreprises et commerces',
      color: '#3b82f6',
      icon: '🏢',
      sortOrder: 1,
    });
    expect(errors).toHaveLength(0);
  });

  it('fails when name is missing', async () => {
    const errors = await getErrors(CreateClientTypeDto, { code: 'TEST' });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('fails when code is missing', async () => {
    const errors = await getErrors(CreateClientTypeDto, { name: 'Test' });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('fails when code contains lowercase letters', async () => {
    const errors = await getErrors(CreateClientTypeDto, {
      name: 'Test',
      code: 'residential', // should be RESIDENTIAL
    });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) =>
      e.toLowerCase().includes('majuscule') ||
      e.toLowerCase().includes('uppercase') ||
      e.toLowerCase().includes('pattern') ||
      e.toLowerCase().includes('format') ||
      e.toLowerCase().includes('uniquement')
    )).toBe(true);
  });

  it('fails when code contains spaces', async () => {
    const errors = await getErrors(CreateClientTypeDto, {
      name: 'Test',
      code: 'CLIENT TYPE',
    });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('fails when code contains hyphens', async () => {
    const errors = await getErrors(CreateClientTypeDto, {
      name: 'Test',
      code: 'CLIENT-TYPE',
    });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('passes when code contains uppercase, digits, and underscores', async () => {
    const errors = await getErrors(CreateClientTypeDto, {
      name: 'Test Type 1',
      code: 'TEST_TYPE_1',
    });
    expect(errors).toHaveLength(0);
  });

  it('fails when code exceeds 50 characters', async () => {
    const errors = await getErrors(CreateClientTypeDto, {
      name: 'Test',
      code: 'A'.repeat(51),
    });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('fails when name exceeds 100 characters', async () => {
    const errors = await getErrors(CreateClientTypeDto, {
      name: 'A'.repeat(101),
      code: 'TEST',
    });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('fails when color exceeds 7 characters', async () => {
    const errors = await getErrors(CreateClientTypeDto, {
      name: 'Test',
      code: 'TEST',
      color: '#AABBCCDD', // 9 chars
    });
    expect(errors.length).toBeGreaterThan(0);
  });

  // BUG-04 (fixed): sortOrder now carries @IsInt(). class-validator
  // rejects non-numeric values at the DTO layer instead of letting the
  // request reach Prisma and produce a 500.
  it('sortOrder rejects a non-numeric string (BUG-04 fix verification)', async () => {
    const errors = await getErrors(CreateClientTypeDto, {
      name: 'Test',
      code: 'TEST',
      sortOrder: 'abc',
    });
    expect(errors.length).toBeGreaterThan(0);
  });
});

// ─── UpdateClientTypeDto ─────────────────────────────────────────────────────

describe('UpdateClientTypeDto', () => {
  it('passes with empty body (all fields optional)', async () => {
    const errors = await getErrors(UpdateClientTypeDto, {});
    expect(errors).toHaveLength(0);
  });

  it('passes with only isActive', async () => {
    const errors = await getErrors(UpdateClientTypeDto, { isActive: false });
    expect(errors).toHaveLength(0);
  });

  it('fails when isActive is not a boolean', async () => {
    const errors = await getErrors(UpdateClientTypeDto, { isActive: 1 });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('fails when code contains lowercase in update', async () => {
    const errors = await getErrors(UpdateClientTypeDto, { code: 'lowercase' });
    expect(errors.length).toBeGreaterThan(0);
  });
});

// ─── CreateAddressTypeDto ─────────────────────────────────────────────────────

describe('CreateAddressTypeDto', () => {
  it('passes with name and code', async () => {
    const errors = await getErrors(CreateAddressTypeDto, {
      name: 'Bureau',
      code: 'OFFICE',
    });
    expect(errors).toHaveLength(0);
  });

  it('fails when code is empty string', async () => {
    const errors = await getErrors(CreateAddressTypeDto, {
      name: 'Test',
      code: '',
    });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('fails when code contains lowercase', async () => {
    const errors = await getErrors(CreateAddressTypeDto, {
      name: 'Bureau',
      code: 'office', // lowercase
    });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('passes with valid code and all optional fields', async () => {
    const errors = await getErrors(CreateAddressTypeDto, {
      name: 'Chantier',
      code: 'WORKSITE',
      description: 'Site de travaux',
      color: '#ef4444',
      icon: '🔧',
      sortOrder: 3,
    });
    expect(errors).toHaveLength(0);
  });

  it('sortOrder rejects a non-numeric string (BUG-04 fix verification, mirrors ClientType)', async () => {
    const errors = await getErrors(CreateAddressTypeDto, {
      name: 'Test',
      code: 'TEST',
      sortOrder: 'not-a-number',
    });
    expect(errors.length).toBeGreaterThan(0);
  });
});

// ─── UpdateAddressTypeDto ─────────────────────────────────────────────────────

describe('UpdateAddressTypeDto', () => {
  it('passes with empty body', async () => {
    const errors = await getErrors(UpdateAddressTypeDto, {});
    expect(errors).toHaveLength(0);
  });

  it('passes with isActive: true', async () => {
    const errors = await getErrors(UpdateAddressTypeDto, { isActive: true });
    expect(errors).toHaveLength(0);
  });

  it('fails when isActive is a string', async () => {
    const errors = await getErrors(UpdateAddressTypeDto, { isActive: 'false' });
    expect(errors.length).toBeGreaterThan(0);
  });
});

// ─── Cross-DTO coherence ──────────────────────────────────────────────────────

describe('CreateClientTypeDto vs CreateAddressTypeDto — structural symmetry', () => {
  it('both DTOs reject code with special characters', async () => {
    const clientErrors = await getErrors(CreateClientTypeDto, {
      name: 'Test',
      code: 'TYPE@1',
    });
    const addressErrors = await getErrors(CreateAddressTypeDto, {
      name: 'Test',
      code: 'TYPE@1',
    });
    expect(clientErrors.length).toBeGreaterThan(0);
    expect(addressErrors.length).toBeGreaterThan(0);
  });

  it('both DTOs accept the same valid code format', async () => {
    const validCode = 'VALID_CODE_123';
    const clientErrors = await getErrors(CreateClientTypeDto, {
      name: 'Test',
      code: validCode,
    });
    const addressErrors = await getErrors(CreateAddressTypeDto, {
      name: 'Test',
      code: validCode,
    });
    expect(clientErrors).toHaveLength(0);
    expect(addressErrors).toHaveLength(0);
  });

  it('both reject name exceeding 100 characters', async () => {
    const longName = 'N'.repeat(101);
    const clientErrors = await getErrors(CreateClientTypeDto, {
      name: longName,
      code: 'CODE',
    });
    const addressErrors = await getErrors(CreateAddressTypeDto, {
      name: longName,
      code: 'CODE',
    });
    expect(clientErrors.length).toBeGreaterThan(0);
    expect(addressErrors.length).toBeGreaterThan(0);
  });
});
